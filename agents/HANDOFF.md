# Handoff — forge (lukebmay)

**Updated:** 2026-08-08 (D4 DnD cross-mon complete; plan closed)  
**Branch:** `plan/forge-dnd-drop-zones` → merge to master when ready  
**Active P0 next:** logout → load tip; focus walk; chrome drops at batch end  
**DnD zones:** [forge-dnd-drop-zones.md](./plans/forge-dnd-drop-zones.md) — **D0–D4 done** (optional dual-4K live smoke soft)  
**Live smoke:** usable Wayland RC; operator layout OK.

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
Mode B recover + known nested-CON / Guake float residuals. B-manual closed (layout OK).

### 2026-08-08 product path updates (this task)

1. **Focus tab/stack:** no `_reassertTabStackSiblingSlots` on focus (lastTabFocus + raise only).  
   Geometry stays with render/verify — reduces Gmail/Voice PWA flicker on first tab selects.
2. **Apply chrome:** clear at LayoutBatch **end** (before residual place). Hard cap **30s**.  
   Spinner no longer covers residual rehome (~4s after maps settle).
3. **session-sleep** (shellrc): testing API (blank/dpms/lock/suspend/wake sequences) vs settings API.

### Operator next (RC)

1. **Log out → back in** (load tip).  
2. Cold / 2-ghostty `forge layout dev` → mon0 tab\|ghostty; chrome drops when opens settle.  
3. Eyes: tab focus walk on PWAs (no flash).  
4. Optional DPMS: `session-sleep blank --force` / `wake`.  
5. Push/tag only when human asks.

---

## Open human blockers

- hard: resize-autotile-design  
- **done:** B-manual-black-session-verify (layout OK; DPMS deferred to session-sleep)  
- soft: B-ap5 **done** 2026-08-08  
- **done agent:** Wayland residual re-smoke; focus/chrome/session-sleep task  

---

## Agent rules

- **No push** unless asked · **No SSH** without **explicit**  
