# forge-layout-profile-preflight — Reject / warn on bad layout JSON before apply

**Status:** ready
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-22

## Goal

Before ApplyLayout mutates the desk, **parse + validate** the profile and
refuse (or hard-warn) known-bad shapes so operators fix data instead of
debugging “wrong mon / hard-fail” symptoms.

## Acceptance

- [ ] Shared validator (JS `lib/shared/layout-plan.js` and/or CLI) runs on
      load/show/apply path before open/bind
- [ ] Detect at least:
  - Float / Guake / ignore-class windows baked into `tiles` when the command
    was not `--keep-floats` (save should not have written them)
  - Ambiguous dual-mon intent: flat `tiles: [a, b]` that looks like “two
    apps” when operator likely wanted `[[mon0],[mon1]]` (warn with fix hint;
    optional strict refuse behind flag later)
  - Invalid role objects / unknown keys that normalize would silently drop
- [ ] CLI: clear error before DBus ApplyLayout; no partial desk mutation
- [ ] L0: fixtures for good `dev`-like dual-mon, flat single-mon (valid), and
      float-contaminated save
- [ ] Docs: layouts.md “validation” one-liner + how to fix vinyl-style mistakes

## Context

Host 2026-08-22: AI-written `vinyl.json` was flat single-mon
`[inkscape, hsplit(ghostty,YouTube)]` while intent was dual-mon; also had
picked up Guake as a float without `--keep-floats`. Operator will recreate
on WS2 next session. Preflight would have failed fast with a readable
message.

Related product bug (separate): slot-machine id desync hard-fail —
[forge-layout-vinyl-hardfail-slot-ids.md](./forge-layout-vinyl-hardfail-slot-ids.md).
Preflight does **not** replace that fix.

## Session note

Operator ACK: parse/auto-detect bad layouts before implementing. Filed for
next session.
