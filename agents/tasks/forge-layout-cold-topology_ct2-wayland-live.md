# CT2 — Live Wayland one-shot cold layout

**Status:** in progress — code fix landed; operator cold re-smoke after logout  
**Plan:** [forge-layout-cold-topology.md](../plans/forge-layout-cold-topology.md)  
**Depends:** CT1  
**Host:** `black` Wayland dual 4K  

---

## Goal

Single `forge layout dev` from cold/near-cold desk reaches profile topology without Mode B stderr path.

---

## Acceptance

- [ ] mon0 `tab(chrome,Grok)|ghostty`, mon1 `ghostty|tab(YT,Gmail,Voice)`  
- [ ] One CLI invocation; thrashState not required for success  
- [ ] Idempotent second run (moved 0 when correct)  
- [ ] Notes in plan session  
- [x] Root cause + fix for Chrome≠Grok active leaf (belt focus + preserve lastTabFocus)  
- [x] Live partial reopen: close Grok → `layout dev` → Grok reopened + lastTabFocus=Grok  

---

## Session note

**2026-08-08 (agent CT2 work + late-focus):**

### Root causes (Chrome open instead of Grok)
1. Belt `ensure_layout` anchored chrome and stomped lastTabFocus (no re-focus).  
2. **Even with mid-flight focus:** chrome/PWA **late activate** after Grok raise steals open leaf on cold open. Operator: wait until launches stable.

### Fix
1. Mid-flight structure **without focus** when opens are in flight  
2. **Final focus pass** after residual+belt: settle pins → quiet 400ms → focus → reassert 250ms (D012)  
3. `_layoutOp` preserves valid lastTabFocus (D011); chrome-clear after residual (D010)  

### Live
- Settled focus Grok sticks  
- Partial reopen can still mis-mon Grok once (Mode B second run repaired); final focus sets open leaf when structure correct  
- Units green  

### Operator
CLI is live (no logout for final-focus). Cold: `forge layout dev` once; confirm mon0 **Grok** open. If still wrong, say so with `forge tree` mon0 lastTabFocus.

Created 2026-08-08. Wayland is a daily driver.
