# forge-remove-split-chrome — Drop blue one-edge split borders

**Status:** in progress  
**Branch:** master  
**Updated:** 2026-08-19  
**Agent:** Grok 4.5

## Goal

Remove H/V **split chrome** / split-direction hint borders entirely. Focus
borders (purple tiled, etc.) stay. Place-next / drag preview are separate and
unchanged.

## Why

Operator: focused Ghostty correctly purple, but one blue edge; neighbor shows
only a blue edge. Blue was mistaken for “next launch goes here” (that is
place-hint / tile preview). Split chrome (FCC C3 / I5) painted shared split
edges on ancestry leaves — noise without enough product value. Operator chose
**remove entirely**.

## Scope

- Delete paint + `split-chrome.js` + show-all force path
- Remove `split-border-toggle`, `split-chrome-show-all`, keybind toggle, prefs
- Strip CSS / Appearance color row for `.window-split-border`
- Keep actor destroy/hide of leftover `splitBorder` for teardown safety
- Docs/contracts/DECISIONS; delete I5 unit tests; adjust DecorationManager tests

## Acceptance

- [ ] No blue one-edge borders after install + Shell reload
- [ ] Focus borders still work
- [ ] L0 green for touched suites
- [ ] Nest not required (chrome eyes-on on host tip)
