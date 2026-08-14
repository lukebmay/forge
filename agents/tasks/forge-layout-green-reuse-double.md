# forge-layout-green-reuse-double — R029 map-pin / chrome serial / late title

**Status:** in progress
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-13

## Goal

Green `forge layout dev` tiles on the first apply, reuses existing windows
on the second, and does not crash Chrome.

## Acceptance

- [x] Name the failed phase: **open / reuse** (map-pin title + parallel Chrome)
      plus **TILE** (empty title, no `notify::title`)
- [x] Class-only leftover pin at map-wait timeout; class-only replan claim
- [x] Serialize chrome-family opens (same profile)
- [x] `notify::title` re-renders like late wm-class
- [x] L0 guards for the inverted user contract
- [ ] Host/green live: `./install` then `layout dev` on an empty desk;
      second `layout dev` reuses (does not double)

## Context for the next agent (complete + succinct)

Green jobs `015825` / `015903`: `reused 0/1 opened 2–3`, map wait timeout
Grok (+ ghostty), `roles still missing`, Apport “Ubuntu” = Chrome crash
(`/var/crash/_opt_google_chrome_chrome.1000.crash`). Session-layout before
the 21:57 X restart already had **two** windows titled Grok.

Map-wait only considers new windows, but `title~=Grok` refused the PWA
while it was still “New Tab”. Abort left placeholders. Next apply opened
another Chrome. Empty title made `isFloatingExempt` FLOAT with no title
signal to retile.

D034. Guards: `test_wait_class_fallback_*`, `TestClaimClassFallback`,
`bug-r029-late-title`. CLI is live immediately; extension JS needs
`./install` + nest or logout on Wayland, HUP on X11 (green is X11).

## Session note

**2026-08-13:** Diagnosed on green via SSH. Implemented D034 + R029.
L0: layout_apply/plan/class_eq + bug-r029 + live_matrix catalog green.
Did not re-run `layout dev` on green (leftover PHs; chrome dead).
