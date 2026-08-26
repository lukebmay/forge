# WR9 — shellrc `FORGE_WORKON_DIR` env snippet

**Plan:** [forge-workon-reconcile.md](../../forge-workon-reconcile.md)  
**Status:** Done (already shipped; verified this session)  
**Priority:** Later polish  

## Goal

Auto-export `FORGE_WORKON_DIR` (and optional host override) from shellrc so
`forge workon` resolves host profiles without a manual one-liner each session.

## Acceptance

1. [x] shellrc sources set `FORGE_WORKON_DIR` when workon config tree exists  
2. [x] Documented in shellrc `configs/forge/workon/README.md`  
3. [x] Live black: `FORGE_WORKON_DIR` points at shellrc tree; `forge workon list` → host  

## Implementation (pre-existing)

| Path | Role |
| --- | --- |
| `shellrc/shell-sources/zsh/forge.zsh` | If forge CLI/extension present and `configs/forge/workon` exists → `export FORGE_WORKON_DIR=…` (honor prior override). `SHELLRC_FORGE_HOST` → `FORGE_HOST` when unset. |
| `shellrc/configs/forge/workon/README.md` | Env table + auto note |

No Forge-tree code change required for WR9.

## Session note

**WR9 Done (verify only, 2026-07-27).** Env auto-export already live on black
via `forge.zsh` (commit `b529000` era). Confirmed `FORGE_WORKON_DIR` set and
host profile resolve works. Closed plan polish tail.

### Next-agent
- Workon plan **complete** (WR1–WR15 + WR6–WR9).
- Optional residual: mon1 tab `roleOrder` structure settle (non-blocking).
- Regression watch / personal fork / B1 only if prioritized.
