# forge-focus-close-and-escape_fc1-close-restore — Wire close → policy focus

**Status:** next  
**Plan:** [forge-focus-close-and-escape](../plans/forge-focus-close-and-escape.md)  
**Branch:** master  
**Depends:** FC0  
**Updated:** 2026-08-09

## Goal

On window close (decoration click, Super+Q, Meta delete), activate the window
chosen by FC0 policy. After single-child dissolve, focus the promoted survivor.

## Acceptance

- [ ] `_restoreFocusAfterWindowClosed` uses FC0 helper (LFT then next/prev sibling)
- [ ] Close penultimate sibling in a split/tab: CON collapses; survivor focused
- [ ] Unit/extension tests for restore capture + activate order
- [ ] Live X11: close tab sibling, close split sibling, close penultimate in HSPLIT

## Context

- Capture siblings **before** `removeNode` (existing bugfix for #470).
- After collapse, parent/sibling lists change — prefer re-resolve survivor via
  tree find on the intended Meta id rather than stale node pointers.
