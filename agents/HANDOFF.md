# Handoff — forge (lukebmay)

**Updated:** 2026-08-06 (settle-learning SL1+SL2 on master)  
**Branch tip:** `master` (ahead of origin); plan branch `plan/forge-settle-learning` same tip  
**Install:** this tip; Wayland **cannot HUP** — logout to load  
**Wayland:** residual fails noted; settle data collection ready (`forge thrash`)  
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
| Settle learning SL1+SL2 | **Done** — open + batch samples; `forge thrash` |
| Unit: window + extension | Green |
| X11 dual-ws + layout smoke | **Green** |
| Wayland residual re-smoke | **Partial fail** (see residuals) |
| Session DPMS / daily layout | **Human** B-manual |
| AP5 visual matrix | **Human soft** |

### Wayland residuals (2026-08-06 operator)

| Symptom | Note |
| --- | --- |
| mon0 left TABBED: Grok not open/visible unit after `layout dev` | tab settle / active leaf? |
| Only Ghostty → `layout dev` → mon0 one giant tab (no tab\|ghostty split) | residual structure race? |

**Decision:** mid [settle-learning](./plans/forge-settle-learning.md) data first.
Agent SL1+SL2 shipped; use thrash dump before more WR patches. Topology may still
need a separate fix if samples show settle is fine.

### Settle learning (agent shipped)

| Piece | How |
| --- | --- |
| Open quiet | Learned raise-only `minQuietMs` from time-to-stable samples (Ghostty seed floor) |
| Layout batch | Deferred release stamps settle pending (`mappedAt`) |
| Dump | `forge thrash` → DBus `GetThrashCatalog` → catalog snapshot JSON |

---

## Operator checklist (you)

1. **Install** from this tree (`./install` or `forge install`).  
2. **Log out → GNOME on Wayland** (required to load new JS + DBus).  
3. Confirm Forge ACTIVE + purple focus border.  
4. Residual smoke: [forge-wayland-live_residual-smoke](./tasks/forge-wayland-live_residual-smoke.md)  
   - `forge layout dev` → mon0 open leaf **Grok** full slot  
   - Sole Ghostty re-layout: expect mon0 **tab \| ghostty** split, not one giant tab  
   - After settle: **`forge thrash`** — paste/share entries with settleMs / minQuiet  
5. Optional: [B-manual](./blockers/B-manual-black-session-verify.md), [B-ap5](./blockers/B-ap5-operator-visual-matrix.md).  
6. When happy: ask to **push** / tag per [RELEASING.md](../RELEASING.md).

---

## Agent rules (reminder)

- **No push** unless human asks.  
- **No SSH** without **explicit** in the current message.  
