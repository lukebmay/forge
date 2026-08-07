# Handoff — forge (lukebmay)

**Updated:** 2026-08-06 (WR1+WR2 Wayland residuals on master)  
**Branch tip:** `master` @ merge `db50561` (WR1 `dd7e6ca` + WR2 `1f44c0b`) — local, **ahead of origin**, not pushed  
**Install:** reinstall this tip; Wayland **cannot HUP** — logout to load  
**Wayland:** **Operator re-smoke** after install+logout  
**Stash:** `stash@{0}` still present — **drop only after human OK**  
**Remotes:** **no push** unless human asks  

---

## Stable RC

| Gate | Status |
| --- | --- |
| CSS dual-load → **effective overlay** (user colors) | **Done** |
| Workspace scope WS0–WS3 | **Done** |
| WR1 chrome geom / focus thrash | **Done** (open-leaf reassert; targeted rect-mismatch recovery) |
| WR2 Guake focus/LFT mon | **Done** (Guake-only rehome on map+focus) |
| Unit: window + extension | Green (WR suites + pre-commit) |
| X11 dual-ws + layout smoke | **Green** (pre-WR) |
| Wayland residual re-smoke | **Human** after install+logout |
| Session DPMS / daily layout | **Human** B-manual |
| AP5 visual matrix | **Human soft** |

| Explicitly **not** RC | Note |
| --- | --- |
| Container motion / peel | design + MD1 post-RC |
| Resize / autotile | design P3 |
| Tab chrome drag / S3+ | later |

### WR1 / WR2 (this wrap)

Operator Wayland report: Guake always right; Grok not open leaf / stuck ¼ height;
Chrome PWA focus flicker; journal verify give-up rect-mismatch.

| Fix | Detail |
| --- | --- |
| WR1 | Focus reassert **open leaf only**; pure rect-mismatch → targeted reassert (not full forest); give-up → **force** reassert |
| WR2 | Guake float rehome: tile mon → LFT → focus mon → mon0 on map + focus |

Plan: [forge-wayland-operator-residuals](./plans/forge-wayland-operator-residuals.md)

### Operator checklist (you)

1. **Install** from this tree (`./install` or `forge install`) if agent did not.  
2. **Log out → GNOME on Wayland** (required to load new JS).  
3. Confirm Forge ACTIVE + purple focus border.  
4. Residual smoke: [forge-wayland-live_residual-smoke](./tasks/forge-wayland-live_residual-smoke.md)  
   - `forge layout dev` → mon0 open leaf **Grok** full slot  
   - Focus walk + tab clicks → **no** Chrome ¼ flicker / stuck undersize  
   - Guake F12: focus mon0 → left; focus mon1 → right  
5. Optional: [B-manual](./blockers/B-manual-black-session-verify.md), [B-ap5](./blockers/B-ap5-operator-visual-matrix.md).  
6. When happy: ask to **push** / tag per [RELEASING.md](../RELEASING.md).

---

## Agent rules (reminder)

- **No push** unless human asks.  
- **No SSH** without **explicit** in the current message.  
