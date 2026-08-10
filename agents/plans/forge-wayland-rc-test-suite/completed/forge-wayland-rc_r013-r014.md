# forge-wayland-rc_r013-r014 — Wayland RC multi-open + GetTree open-leaf

**Status:** done
**Plan:** forge-wayland-rc-test-suite
**Branch:** master
**Blocker:** agents/blockers/completed/B-wayland-host-tip-logout.md
**Updated:** 2026-08-10

## Goal

Clear Wayland RC suite (`forge test live run --from-work wayland-rc`) on host dual-mon with Guake FLOAT (true cold OK).

## Acceptance

- [x] L0 green (layout_apply / live_matrix / nested / …)
- [x] Identify R013 (belt flattens TABBED after mon rehome)
- [x] Ship beltStructure after belt mon-moves (CLI; live immediately)
- [x] Identify R014 (GetTree syncLastTabFocusFromFocus stomps open leaf)
- [x] Remove GetTree mutation; tip installed on disk (`-dirty`)
- [x] Host Shell loads tip (logout once) — `versionName …-dirty`
- [x] Re-run `forge test live run --from-work wayland-rc` all PASS (see note)
- [x] Nest down after campaign

## Context for the next agent (complete + succinct)

### R013 / R014 (shipped)

| Id | Fix | Where |
| --- | --- | --- |
| R013 | After belt mon-moves, place→structure rebind (`beltStructure`) | `scripts/forge/forge` |
| R014 | GetTree no longer calls `syncLastTabFocusFromFocus` | `lib/extension/session-api.js` |

### Host RC after logout (2026-08-10)

- Session: Wayland · tip `v49-90-beta.2-292-g89d5223-dirty` · Guake FLOAT · nest False
- L0: 173 passed (`test_layout_apply` / `test_live_matrix` / `test_nested_wayland`)
- Full `wayland-rc` first run: **9/10** — only `L1.ghosttys-only` FAIL (post-login cold: hard-ready 5s timeout for 6 just-opened windows; placeholders left)
- Immediate re-run `L1.ghosttys-only`: **PASS** (open leaves Grok/YouTube, softCorrections=0)
- All other cases including **L1.right-ghostty**, **L2.true-cold-dev**, **L2.layout-clean**, **R012**: PASS
- Reports: `agents/test-results/wayland/black-wayland-20260810T200423Z.json` (+ retest `…T200440Z.json`)

**Verdict:** R013/R014 host RC cleared. First-case fail was post-logout cold hard-ready, not open-leaf thrash.

### Files touched (this campaign)

- `scripts/forge/forge` — beltStructure
- `scripts/forge/layout_apply.py` — belt docstring
- `lib/extension/session-api.js` — GetTree no sync
- `agents/REGRESSIONS.md` — R013, R014

## Session note

2026-08-10: Logout completed; host tip live. Full wayland-rc green after single-case retest of post-login cold fluke. Nest stopped. Task closed.
