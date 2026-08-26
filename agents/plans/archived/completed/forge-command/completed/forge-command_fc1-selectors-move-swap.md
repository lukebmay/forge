# Task — FC1: Tile selectors + focus / move / swap

**Status:** Done (A/B **AGREE**)  
**Plan:** [forge-command.md](../plans/forge-command.md)  
**Priority:** P1  
**Kind:** Plan-linked  
**When done:** move to `agents/plans/forge-command/completed/`

## Problem

FC0 can dump the tree but scripts cannot address a tile or mutate layout.
Need a shared selector grammar and DBus/CLI ops that reuse the same engine
as keybinds where possible.

## Goals

1. **Tile selector grammar** (pure module, unit-tested), forms at least:
   - `focus` / `lft` (global LFT)
   - `title:Exact` / `title~=substr` / `title~=/regex/` (or documented regex form)
   - `class:WmClass` / `class:WmClass@mon` (monitor index, `moN`, or stable role if available)
   - `path:…` tree path from mon id/role (e.g. `mo0ws0/0/1` child indices)
   - Optional window id if projection exposes `windowId`
2. **Resolve** selector against live tree → 0 / 1 / N WINDOW matches.
   - 0 → error; N>1 → error with candidate list (title/class/path) unless
     `--first` / `{ first: true }`
3. **DBus methods** on existing SessionApi interface (extend XML carefully):
   - `Focus(selector_json_or_s) → s` JSON result
   - `Swap(a, b) → s`
   - `Move(tile, dest) → s` — dest = selector or path; implement insert/swap
     using existing tree helpers (`swapPairs`, reparent/move paths) without
     inventing a new layout engine
   - Prefer string args that are either plain selectors or small JSON
4. **CLI** (`scripts/forge/forge`):
   - `forge focus <sel>`
   - `forge swap <a> <b>`
   - `forge move <tile> <dest>`
   - `forge tree` already exists — keep working; may enrich with paths for
     scripting if cheap
5. Unit tests for selector parse + match against mock forest; `npm test` green.
6. DESIGN short note on grammar; plan session note.

## Code touch list (expected)

| Area | Notes |
| --- | --- |
| New `lib/extension/tile-select.js` | parse + match pure |
| `lib/extension/session-api.js` | Focus/Swap/Move methods |
| `lib/extension/window.js` / `tree.js` / `command.js` | thin reuse; avoid copy-paste |
| `scripts/forge/forge` | subcommands |
| Tests | tile-select + maybe session helpers |
| DESIGN / plan / task | notes |

## Acceptance

- [x] Selector parse + resolve unit-tested (exact/substring/class/path/focus/lft)
- [x] Ambiguous match fails with candidates; `--first` forces first
- [x] DBus Focus/Swap/Move return JSON `{ ok: true }` or `{ error, candidates? }`
- [x] CLI focus/swap/move call DBus; exit non-zero on error
- [x] Reuses tree swap/move primitives (no Shell.Eval)
- [x] `npm test` green (1772 tests)
- [x] No launch (FC2), settings (FC3), RunSteps (FC4), workon (FC5)

## Out of scope

- `forge launch` / wait for wmClass
- Settings get/set/save/load
- Batch RunSteps / freezeRender
- Full i3 IPC; complex composite matchers beyond grammar above
- `layout` subcommand optional stretch — only if trivial via CommandHandler

## Session note

**Task Force A (implement) — 2026-07-25**

### Files
- `lib/extension/tile-select.js` — pure parse/match/pick; grammar in header
- `lib/extension/session-api.js` — Focus/Swap/Move + XML; `apiVersion: 2`
- `scripts/forge/forge` — `focus` / `swap` / `move` + global/`--first`
- `tests/unit/extension/tile-select.test.js`
- `docs/DESIGN.md` — grammar + move semantics
- plan/task notes

### Selector grammar (summary)
`focus` | `lft` | `title:` / `title~=` / `title~=/re/` | `class:` / `class:@mon` |
`path:mon/idx…` | `id:N` | JSON `{selector, first}`.

### DBus
- `Focus(s) → s`
- `Swap(s, s) → s` — `tree.swapPairs` + renderTree
- `Move(s, s) → s` — WINDOW dest: insert **after** dest sibling; CON/MONITOR
  path: `appendChild` + `resetSiblingPercent`
- Errors: `{error:"not found"|"ambiguous", candidates?}` never throw

### Move
Not directional keybind Move; reparent only. Swap is separate.

### Tests
tile-select unit coverage (parse, match, ambiguous, path, focus/lft ctx).

### Residual risks
1. Live Focus/Swap/Move not exercised under Shell in CI.
2. `monRoleToId` not wired (role only if caller injects); stableKey/liveMap works.
3. Move into tab/stack may need render/focus polish on live host.
4. Cross-monitor Move does not call `move_to_monitor` geometry path — append only.

### Next-agent (B)
- Diff review + collateral; re-run `npm test`.
- Confirm CLI help / no FC2+ scope.
- Live smoke optional on host.

## Session note

**2026-07-25 Task Force B — AGREE.** Acceptance met; 1772 tests green.
Residuals: swapPairs silent no-op; monRoleToId not wired; cross-mon Move
tree-only; no live Shell smoke in CI. No code changes from B.

**A implement:** tile-select.js; Focus/Swap/Move DBus; CLI focus|swap|move.
