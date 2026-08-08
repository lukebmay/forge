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

**2026-08-08 (agent CT2 work):**

### Root cause (Chrome open instead of Grok)
Post-open **belt** re-ran `ensure_layout` tabbed with `windowIds[0]=chrome` as layout selector. `_layoutOp` always set `lastTabFocus` to that selector. Belt **omitted focus**, so residual focus Grok was stomped. Same on cold residual path whenever belt re-ensured.

### Fix
1. `belt_actions_from_plan`: include **focus** with ensure_layout/order/move  
2. `_layoutOp`: if already TABBED/STACKED and `lastTabFocus` still a child, **preserve** it  
3. D010 chrome-clear after residual (uncommitted → same ship)  
4. D011  

### Live check (this session, CLI live without logout)
- Settled desk: layout → lastTabFocus Grok ✓  
- Close Grok → layout → reopen Grok, lastTabFocus=Grok ✓ (no layered thrash)  
- Units: layout apply+plan **291** pass; session-api layout-cycle **16** pass  

### Still needs operator (Wayland)
`./install` done; **logout** for extension `_layoutOp` preserve. Then cold/near-cold one-shot CT2 acceptance.

Created 2026-08-08. Wayland is a daily driver.
