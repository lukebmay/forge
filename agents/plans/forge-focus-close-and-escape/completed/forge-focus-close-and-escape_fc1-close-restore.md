# forge-focus-close-and-escape_fc1-close-restore — Wire close → policy focus

**Status:** completed  
**Plan:** [forge-focus-close-and-escape](../../forge-focus-close-and-escape.md)  
**Branch:** master  
**Depends:** FC0  
**Updated:** 2026-08-09

## Goal

On window close (decoration click, Super+Q, Meta delete), activate the window
chosen by FC0 policy. After single-child dissolve, focus the promoted survivor.

## Acceptance

- [x] `_restoreFocusAfterWindowClosed` uses FC0 helper (LFT then next/prev sibling)
- [x] Close penultimate sibling / sole group child: survivor or LFT focused (live)
- [x] Unit: pure `pickFocusAfterClose` (FC0); wire is thin GJS in `window.js`
- [x] Live X11: close focused New Tab → Ghostty (LFT); close focused Grok → Ghostty

## Context

- Capture ids **before** `removeNode` (`_captureFocusRestore`).
- After collapse, resolve Meta via `_findMetaWindowById` (not stale node pointers).
- LFT ring already dropped closed node in `windowDestroy` before capture.

## Session note

2026-08-09: FC1 wired + `./install` live reload. Next: FC2 unfocus keybind.
