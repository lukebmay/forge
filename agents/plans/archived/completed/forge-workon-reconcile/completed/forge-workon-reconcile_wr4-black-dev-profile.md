# WR4 — Black `dev` v2 profile + shellrc host tree

**Plan:** [forge-workon-reconcile.md](../../forge-workon-reconcile.md)  
**Status:** Done  
**Priority:** P1 product  
**Depends:** WR1–WR3

## Goal

Ship a real **black** morning profile as v2 reconcile roles, living in
**shellrc** host tree (like gdisplays), plus README for the layout.

## Acceptance

1. shellrc tree:
   ```text
   ~/dev/me/shellrc/configs/forge/workon/
     README.md
     hosts/black/dev.json    # v2 reconcile — dual 4K morning
   ```
2. `dev.json` matches plan black target roles (chrome/grok | ghostty ;
   ghostty | yt/gmail/voice) with sensible matchers + open fields.
3. Validate with `validate_reconcile_profile` (import workon_plan).
4. Optional in Forge repo: copy or symlink note in `scripts/forge/examples/workon-dev-v2.json`
   pointing at schema for users without shellrc.
5. README documents: search order, `FORGE_WORKON_DIR`, `FORGE_HOST`, example
   `export FORGE_WORKON_DIR=$shellrc/configs/forge/workon`.
6. If cheap: document how to dry-run:
   `FORGE_WORKON_DIR=… forge workon plan dev` or `forge workon dev --dry-run`.

## Non-goals

- Live apply on black (WR6)
- Auto shellrc install/env snippet (WR9) — README export is enough
- Perfect Chrome title matching for every non-PWA title (document heuristic)

## Session note

**WR4 Done (2026-07-26):**

| Path | What |
| --- | --- |
| `shellrc/configs/forge/workon/README.md` | Host layout, env, search order, dry-run, Chrome match caveats |
| `shellrc/configs/forge/workon/hosts/black/dev.json` | v2 reconcile dual-mon morning |
| `forge/scripts/forge/examples/workon-dev-v2.json` | Schema example (same roles as black) |
| `forge/scripts/forge/README.md` | `FORGE_WORKON_DIR` + shellrc path + example note |

Validated: `validate_reconcile_profile` on black + example → ok.

**Roles:** mon0 `left-tab` chrome-luke+grok | `term` ghostty-left; mon1 `term`
ghostty-right | `comms` youtube+gmail+voice; overflow mon0 tabbed.

**Match caveats for WR6:** `chrome-luke` exact title `Google Chrome` only (tab
titles like `… - Google Chrome` miss); PWA `title~=` can steal from ordinary
tabs; two Ghostties share class `com.mitchellh.ghostty` (claim prefers mon).

**Next:** WR5 UX/docs, then WR6 live trials (not this task).
