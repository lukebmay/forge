# CT2 — Live Wayland one-shot cold layout

**Status:** ready  
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

---

## Session note

Created 2026-08-08. Wayland is a daily driver.
