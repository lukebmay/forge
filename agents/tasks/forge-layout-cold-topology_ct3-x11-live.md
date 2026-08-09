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

- [x] Same profile structure as CT2 on X11 (dev: mon0 tab+ghostty / mon1 ghostty+tab)  
- [x] No Wayland-only assumptions in bind path  
- [x] Document any residual X11-only quirks  
- [x] Notes in plan session  
- [ ] Optional: true cold empty (all roles closed) re-smoke  

---

## Session note

**2026-08-09 (black X11, settle SE3–SE5):** Near-cold empty desk (only this Ghostty) →
`forge layout dev --verbose` **ok**. Soft barrier first-ever `softTimeoutMs=6000`,
`corrections=0`, `softSettled=true`, post-settled verify skipped (match). Live tree:
mon0 `lastTabFocus`=Grok, mon1=YouTube, `focusWindowId`=ghostty (agent terminal kept).
Heuristics written `~/.config/forge/config/settle-heuristics.json` (zero-residual trials).
Second apply settled no-op ~0.1s. **Did not close agent Ghostty.** Pin residual now 15s (SE5).

**2026-08-08 cold after reboot (black X11):** structure OK; mon0 Chrome over Grok (pre-D017).

Created 2026-08-08.
