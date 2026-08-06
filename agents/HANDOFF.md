# Handoff — forge (lukebmay)

**Updated:** 2026-08-06 (wrap-up: X11 RC + theme effective overlay; Wayland next)  
**Branch tip:** `master` @ `5a8714a` (+ wrap-up docs) — local, **ahead of origin**, not pushed  
**Install:** `v49-90-beta.2-205-g5a8714a` · X11 ACTIVE  
**Wayland:** **Operator next** — log out → GNOME on Wayland → residual smoke  
**Stash:** `stash@{0}` still present — **drop only after human OK**  
**Remotes:** **no push** unless human asks  

---

## Stable RC

| Gate | Status |
| --- | --- |
| CSS dual-load → **effective overlay** (user colors) | **Done** (`5a8714a`) |
| Workspace scope WS0–WS3 | **Done** (merged master) |
| Unit: npm + pytest cli | Green (pre-theme-wrap) |
| X11 dual-ws + layout smoke | **Green** |
| Theme: personal purple via `effective.css` | Fixed; re-check after Wayland login |
| Wayland residual | **Human** after logout |
| Session DPMS / daily layout | **Human** B-manual |
| AP5 visual matrix | **Human soft** |

| Explicitly **not** RC | Note |
| --- | --- |
| Container motion / peel | design + MD1 post-RC |
| Resize / autotile | design P3 |
| Tab chrome drag / S3+ | later |

### Theme fix (this wrap)

St.Theme did not honor dual-load or simple concat — borders stayed bundled red while
purple lived in `~/.config/forge/stylesheet/forge/stylesheet.css`.

**Now:** merge base+user into `~/.config/forge/stylesheet/forge/effective.css`
(one rule per selector, user wins); load only that sheet; restyle on
`css-updated` / Super+Shift+r. Install defaults to theme reload after HUP.

### Operator checklist (you)

1. **Log out → GNOME on Wayland.**  
2. Confirm Forge ACTIVE + purple focus border.  
3. Residual smoke: [forge-wayland-live_residual-smoke](./tasks/forge-wayland-live_residual-smoke.md)  
   (`forge layout dev`, focus walk, tabs, no reflow/thrash).  
4. Optional: [B-manual](./blockers/B-manual-black-session-verify.md), [B-ap5](./blockers/B-ap5-operator-visual-matrix.md).  
5. When happy: ask to **push** / tag per [RELEASING.md](../RELEASING.md).

---

## Agent rules (reminder)

- **No push** unless human asks.  
- **No SSH** without **explicit** in the current message.  
