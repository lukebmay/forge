# WR7 — `forge workon capture` (sketch from tree)

**Plan:** [forge-workon-reconcile.md](../../forge-workon-reconcile.md)  
**Status:** Done  
**Priority:** P1 polish (after WR6 live accept)  
**Depends:** WR1–WR6, WR10 sugar  

## Goal

Authoring assist: snapshot the **current tiling forest** into a compact
**`tiles` sugar** profile sketch so humans do not hand-write dual-mon JSON.

## Product locks

| Topic | Decision |
| --- | --- |
| Command | `forge workon capture` (optional name for description only; **no** auto-write to host path by default) |
| Output | **stdout** JSON (pretty); optional `--out PATH` write |
| Shape | Prefer **`tiles` sugar** (not full IR essay) |
| Match | Best-effort: `class` + `title~=` when multiple same-class windows; main Chrome → `title~="Google Chrome"` when title ends with that product name |
| Open | Best-effort `{ "app": … }` from class/title; user edits later |
| Floating | Include top-level `floating: []` if no floats; floats as list of role-ish objects if present and cheap |
| Offline | `--tree-file PATH` works without DBus (like dry-run) |
| Validate | Output must pass sugar normalize + `validate_reconcile_profile` |

## Acceptance

1. [x] `forge workon capture` (live or `--tree-file`) prints valid tiles sugar JSON to stdout.
2. [x] Round-trip: `normalize` + `plan_reconcile(forest, ir)` reuses **all** captured roles when run against the **same** forest (opened=0, no missing roles).
3. [x] Dual-mon HSPLIT + tabbed groups produce nested arrays (tab slots) + mon panes.
4. [x] Unit tests on pure capture helper with fixture tree (no Shell).
5. [x] Help/docs: one section in `forge workon help` + `docs/user/workon.md`.
6. [x] Does **not** overwrite shellrc profiles unless user passes `--out` explicitly.

## Non-goals

- Perfect open argv for every Chrome PWA  
- GUI editor  
- Auto-install into hosts/<host>/  
- stableKey mon names (WR8)  
- Closing windows  

## Layout shipped

| Piece | Where |
| --- | --- |
| Pure capture | `scripts/forge/workon_capture.py` |
| CLI wire | `scripts/forge/forge` (`capture` action, `--out`, offline `--tree-file`) |
| Tests | `tests/unit/cli/test_workon_capture.py` (uses `tree-perfect.json` etc.) |
| Docs | `docs/user/workon.md`, `cli_help.py`, `scripts/forge/README.md` |

## Session note

**WR7 Done (A).**

**Shipped:**
- `scripts/forge/workon_capture.py` — `capture_tiles_profile(forest)`, `profile_for_output`, `format_capture_stderr`
  - Physical mon select (prefer `moNws0`, skip empty ws copies)
  - Mon panes L→R / T→B by rect; TABBED/STACKED → nested role lists
  - Rich cells: class match; Chrome product → `title~="Google Chrome"`; multi same-class → short title frag; open from class stem
- CLI: `forge workon capture` [|`--tree-file`|`--out`|optional name→description]
- Docs/help/README updated

**Round-trip proof:** `tree-perfect.json` → capture → normalize → `plan_reconcile` → **opened=0**, 7 roles all claimed (not open). Same for `tree-ghostty-nautilus-tab.json` (2 roles).

**Tests:** `pytest tests/unit/cli/ -q` → **144 passed** (13 capture tests).

**Next-agent bullets:**
- WR8 stableKey mon names in profiles (later)
- WR9 shellrc `FORGE_WORKON_DIR` env snippet (later)
- Optional live smoke: `forge workon capture` on black desk (not required for accept)
- Do **not** implement WR8/WR9 unless tasked
