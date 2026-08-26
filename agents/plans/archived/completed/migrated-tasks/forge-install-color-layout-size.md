# forge-install-color-layout-size — Install colors + layout equal sizes

**Status:** done
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-19

## Goal

Fix two host regressions: (1) `forge install` / job CLI no ANSI in any terminal;
(2) `forge layout` ignoring slot sizes when profile has no `share[]`.

## Acceptance

- [x] Job worker sets `FORGE_COLOR=always` when parent attach stream is a Node TTY (`.isTTY`)
- [x] L0 job-runner covers `streamIsTTY` / Node `isTTY`
- [x] Bare profile splits emit `ensure_sizes` with equal shares (JS + Python)
- [x] AL1 expected fixtures regenerated; reconcile parity green
- [x] PTY `forge install` job log ESC=28; nest bare hsplit re-apply ghosttys 0.5/0.5

## Context for the next agent (complete + succinct)

- **Color (R040):** CN13 used `.isatty()` only; Node uses `.isTTY`. `cli/job-runner.mjs` `streamIsTTY` + colorStream on spawn/runJob.
- **Sizes (R039):** missing `share` ⇒ equal weights in JS+Python `sizeActions`. Host `dev` has no share. Tip installed; **Wayland host desk needs logout** for ApplyLayout JS tip (nest already proved).
- Do not default-share in `normalizeProfile`.

## Session note

Shipped both. Nest R039 ghostty equal PASS; host logout for daily-driver tip.
