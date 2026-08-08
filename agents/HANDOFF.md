# Handoff — forge (lukebmay)

**Updated:** 2026-08-08 (layout clean vs keep fix; Super peek hints)  
**Branch:** `master` (disk install dirty tip; **Wayland needs logout**)  
**Active P0 next:** logout → `layout dev` closes residuals; Super+drag hints with setting off  
**DnD redesign (later):** [forge-dnd-drop-zones.md](./plans/forge-dnd-drop-zones.md)  
**Live smoke:** usable Wayland RC; operator DnD much better.

---

## Campaign: layout apply/settle contract — **complete**

| Item | Status | Commit |
| --- | --- | --- |
| Design lock | **Done** | plan doc |
| AC1 purge verify war | **done** | `333f8bf` |
| AC2 command epoch | **done** | `b20c227` |
| AC3 drop LF6 fingerprint default | **done** | `9633290` |
| AC4 placeholder thrash isolate | **done** | `cf453cb` |
| AC5 slot-math unit tests | **done** | `df60734` |
| AC6 live smoke | **done** | X11 live (docs wrap) |
| AC7 residual nudge | **cancelled** | visual QA fine without (2026-08-08) |

### One-line contract

Plan with tree math → parallel launch → place when admissible → post-apply =
echo residual (350ms) → thrash → float + placeholder — never thrash the forest.

### Wayland RC smoke (2026-08-08, agent)

| Check | Result |
| --- | --- |
| Session | Wayland · Shell 46 · dual MSI 4K @ scale |
| Unit | **2337** vitest + **431** pytest green |
| `forge ping` / enable | ACTIVE; `disable-user-extensions` false |
| Rivals | tiling-assistant disabled; no Pop |
| Disk install | `v49-90-beta.2-234-g5ea572b` (needs **logout** to load) |
| Runtime during smoke | still `…-233-ga6699fe` (pre-logout) |
| Cold `layout dev` | Mode A: mon1 tabs **wrong mon** (all on mon0) |
| 2nd pass | Mode B thrash-recover → mon0 tab\|ghostty + mon1 ghostty\|tab **roles OK** |
| 3rd pass | idempotent reopen 0; residual `order:mon0` / nested HSPLIT |
| Focus walk | Grok / YouTube / both Ghostties **ok**; no stuck ¼ widths |
| Nautilus open/close | no Shell crash; left mon1 single-child **VSPLIT** cruft |
| Guake show | FLOAT mon0; thrash score up; product rehome still **reverted** |
| Journal | no Forge give-up / mismatch / Shell abort in window |
| `make dist` | zip builds |

**RC call:** **usable daily-driver candidate**, not “perfect cold layout.” Ship bar =
Mode B recover + known nested-CON / Guake float residuals; hard DPMS still human.

### 2026-08-08 operator residuals (post Wayland reinstall)

1. **Apply chrome clears too early** — tied to LayoutBatch end (before residual place).  
   **Fixed (disk):** chrome stays through residual; CLI `LayoutBatch chrome-clear` after place; hard cap **30s**.
2. **Close all but 2 Ghostties → `layout dev`** left mon0 nested HSPLIT + mon1 tabs on mon0.  
   Mode B thrash-recover moved mon1 roles; mon0 nested collapse remained unrepaired (`order` soft-no-op).  
   **Fixed (disk):** structure detect mon-direct collapse; `_orderMonChildrenOp` **hoists** nested mon H/V panes + unwraps single-child VSPLIT.

**Needs logout** to load extension tip. Then: thrash-recover (or cold 2-ghostty `layout dev`) should flatten mon0 to tab|ghostty; chrome should stay until tiles settle.

### Operator next (RC)

1. **Log out → back in** (load tip with chrome + mon hoist).  
2. Cold / 2-ghostty `forge layout dev` → mon0 tab\|ghostty, mon1 ghostty\|tab.  
3. Confirm apply chrome stays until residual place finishes.  
4. Eyes: focus walk no flash (soft AP5).  
5. Optional DPMS (B-manual).  
6. Push/tag only when human asks.

---

## Open human blockers

- hard: B-manual-black-session-verify (DPMS / lock)  
- hard: resize-autotile-design  
- soft: B-ap5-operator-visual-matrix  
- **done agent:** Wayland residual re-smoke (Mode B path green; logout for tip)  

---

## Agent rules

- **No push** unless asked · **No SSH** without **explicit**  
