# Handoff — forge (lukebmay)

**Updated:** 2026-08-06 (settle-learning SL1 after Wayland residual report)  
**Branch tip:** `master` (ahead of origin); **active work** `plan/forge-settle-learning`  
**Install:** master tip; Wayland **cannot HUP** — logout to load  
**Wayland:** re-smoke found residuals (see below); agent started settle-learning  
**Stash:** `stash@{0}` still present — **drop only after human OK**  
**Remotes:** **no push** unless human asks  

---

## Stable RC

| Gate | Status |
| --- | --- |
| CSS dual-load → **effective overlay** (user colors) | **Done** |
| Workspace scope WS0–WS3 | **Done** |
| WR1 chrome geom / focus thrash | **Done** |
| WR2 Guake rehome | **Reverted** (`0d18ac0`) — float only |
| Unit: window + extension | Green on master |
| X11 dual-ws + layout smoke | **Green** |
| Wayland residual re-smoke | **Partial fail** (see residuals) |
| Session DPMS / daily layout | **Human** B-manual |
| AP5 visual matrix | **Human soft** |

### Wayland residuals (2026-08-06 operator)

| Symptom | Note |
| --- | --- |
| mon0 left TABBED: Grok not open/visible unit after `layout dev` | tab settle / active leaf? |
| Only Ghostty → `layout dev` → mon0 one giant tab (no tab\|ghostty split) | residual structure race? |

**Decision:** mid [settle-learning](./plans/forge-settle-learning.md) data collection
before more WR patches. Topology may still need a separate fix.

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
