# CT3 — Live X11 one-shot cold layout

**Status:** ready  
**Plan:** [forge-layout-cold-topology.md](../plans/forge-layout-cold-topology.md)  
**Depends:** CT1 (can parallel CT2)  
**Hosts:** `black` X11 session and/or older X11 daily-driver machines  

---

## Goal

Same one-shot cold layout on **X11** — also a daily driver (older machines + testing), not a second-class smoke.

---

## Acceptance

- [ ] Same profile structure as CT2 on X11  
- [ ] No Wayland-only assumptions in bind path  
- [ ] Document any residual X11-only quirks  
- [ ] Notes in plan session  

---

## Session note

**2026-08-08 cold after reboot (black X11):** structure OK; mon0 `lastTabFocus`=Chrome not Grok (no clear tab select); mon1 YouTube content-ish but Voice tab lit / kbd. Profile actives: Grok, YouTube, focus ghostty. Settled `forge layout dev` fixed open leaves. Root: first final focus then late chrome/PWA activate rewrites lastTabFocus — cleanup dropped blind reassert. **Fix D017:** verify-once re-apply mismatches only (`focus_actions_still_needed`). Still need full cold empty re-smoke after this patch.

Created 2026-08-08. Operator: X11 is daily driver on older hosts; CT3 is required parity, not optional.
