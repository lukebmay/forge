# Handoff — forge (lukebmay)

**Updated:** 2026-08-07 (mon-child topology peel)  
**Branch tip:** `master` (ahead of origin)  
**Install:** this tip; Wayland **cannot HUP** — logout to load  
**Wayland:** topology peel shipped offline; needs live re-smoke after logout  
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
| Mon-child giant-tab peel | **Done** (2026-08-07) — plan demotes polluted tab then re-tabs role subset |
| Unit: window + extension + CLI layout | Green (426 CLI unit) |
| X11 dual-ws + layout smoke | **Green** |
| Wayland residual re-smoke | **Pending** install+logout after peel |
| Session DPMS / daily layout | **Human** B-manual |
| AP5 visual matrix | **Human soft** |

### Wayland residuals — status

| Symptom | 2026-08-06 | 2026-08-07 agent |
| --- | --- | --- |
| mon0 giant TABBED (chrome+ghostty+Grok); no tab\|ghostty | fail | **Plan fix shipped** — peel demote + subset tab; live verify after logout |
| Grok not visible open leaf | fail | Expected better after peel + existing active focus ops |
| `forge layout save` float-only Inkscape | `roles must be non-empty` | Clearer: `only floating windows to capture` (tile first) |

Live dry-run on pre-fix forest now plans:

```text
ensure_layout mon0 hsplit [chrome]
ensure_layout mon0.s0 tabbed [chrome, Grok]
ensure_order mon0 [chrome, ghostty]
focus Grok (active) → YouTube → ghostty (profile)
```

### Settle learning

| Piece | How |
| --- | --- |
| Open quiet | Learned raise-only `minQuietMs` (Ghostty seed floor) |
| Layout batch | Deferred release stamps settle pending |
| Dump | `forge thrash` → session-memory catalog (**not** disk) |
| Live samples | Operator: still **0** settleSampleCount in last dump — run thrash after layout |

---

## Operator checklist (you)

1. **Install** from this tree (`./install` or `forge install`).  
2. **Log out → GNOME on Wayland** (required to load new JS + CLI-driven structure).  
3. Confirm Forge ACTIVE + purple focus border.  
4. Residual smoke: [forge-wayland-live_residual-smoke](./tasks/forge-wayland-live_residual-smoke.md)  
   - `forge layout dev` → mon0 **TABBED(Chrome,Grok) \| ghostty**; open leaf **Grok** then profile focus ghostty  
   - Sole Ghostty re-layout: same split, not one giant tab  
   - After settle: **`forge thrash`** — share entries with settleMs / minQuiet if non-zero  
5. Optional: [B-manual](./blockers/B-manual-black-session-verify.md), [B-ap5](./blockers/B-ap5-operator-visual-matrix.md).  
6. When happy: ask to **push** / tag per [RELEASING.md](../RELEASING.md).

### Save notes

- `forge layout save` snapshots **tiled** structure on the **current workspace** only.  
- FLOAT-only desks (e.g. lone Inkscape) → error `only floating windows to capture` — tile the window first, or write the profile by hand.  
- Profiles live under `$FORGE_LAYOUT_DIR/hosts/<host>/` or `~/.config/forge/layout/`.

---

## Agent rules (reminder)

- **No push** unless human asks.  
- **No SSH** without **explicit** in the current message.  
