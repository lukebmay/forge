# forge-tab-min-width-wrap-tune — Tab width-wrap too eager (min-tab-label-chars)

**Status:** done
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-22

## Goal

Tune readable tab min-width so a typical half-pane can keep more short labels
on one row. Operator chose **12** chars.

## Acceptance

- [x] Schema default `min-tab-label-chars` **12** (was 20)
- [x] Docs/contracts/DESIGN/D046 mention 12
- [ ] Host eyes-on after install + `gsettings set … min-tab-label-chars 12`
      (existing user value stays 20 until reset) — next session soft verify

## Context

Implemented 2026-08-22 wrap-up with multi-row height fix. Related completed:
[forge-tab-multirow-double-height.md](./forge-tab-multirow-double-height.md).

## Session note

Default shipped; host may need one gsettings set if key already written as 20.
