# forge-layout-reliability_lf5-settle-before-move

**Status:** done (A/B AGREE)  
**Plan:** [forge-layout-reliability.md](../../forge-layout-reliability.md)  
**Branch:** `plan/forge-layout-reliability`  
**Updated:** 2026-07-29

## Goal

Do **not** layout-move / residual-rehome windows until they are **settled**
(mapped, tracked, first tile pass done). Fix live: close left chrome + right
Ghostty → `forge layout dev` still leaves two Ghosttys on mon0 (LF4 insufficient).

## Product hypothesis (user)

Moves run before the new window has settled; reparent/`move_to_monitor` no-ops
or Meta snaps back.

## Investigate / implement

1. Define **settled** for a GetTree leaf (and/or extension):
   - In tree with windowId
   - Prefer `mode` TILE (or not exempt float)
   - Has non-zero frame / compositor actor
   - Optional: firstRender cleared / not mid window-create-queue
2. CLI `wait_for_wm_class` / layout open path: wait until settled (timeout).
3. Residual / belt **move only after** settled; if not settled, poll then move.
4. Tests for settle predicate + wait behavior (unit/mocked tree).
5. Do **not** close live windows or kill Shell. No SSH.

## Acceptance

- [x] Documented settle criteria in code/session note.
- [x] Layout open wait does not return “ready” on mere class appear if unsettled.
- [x] Residual/belt moves target only settled windows (or wait then move).
- [x] Unit tests green.
- [x] Live re-verify notes for operator (close chrome + right Ghostty).

## Non-goals

- SI1 install focus (done).
- Changing system .desktop files.

## Session note (2026-07-29 Task Force A)

### Root cause

`wait_for_wm_class` returned as soon as a matching class appeared in GetTree —
often still `mode: FLOAT` (pre-`processFloats` / mid `window-create-queue` ~200ms).
Residual + belt `Move` then ran immediately; Meta rehome no-ops or snaps back →
two Ghosttys stay on mon0 after `forge layout dev`.

### Settle criteria (`window_is_settled` in `layout_apply.py`)

1. `windowId` present  
2. `mode` is `TILE` (default; `GRAB_TILE` allowed) — not `FLOAT`  
3. If `rect` present: positive width/height  
4. If `monitor` present: `>= 0`  

### Shipped

| Area | Change |
| --- | --- |
| `scripts/forge/layout_apply.py` | `window_is_settled`, `find_settled_window`, `move_step_window_ids` |
| `scripts/forge/forge` | `wait_for_wm_class(require_settled=True)`; `wait_for_window_ids_settled`; residual + belt poll before Move |
| tests | `TestWindowSettledLf5` in `test_layout_apply.py` |

### Tests

- `pytest tests/unit/cli/ -q` → **307 passed**
- Extension unit suite green (see OP2 handoff)

### Live re-verify (operator)

Close left chrome + right Ghostty → `forge layout dev` → one Ghostty per mon.
Install/HUP this tree first. No commit (parent wraps after B).

**Branch:** `plan/forge-layout-reliability`

## Verifier (2026-07-29 Task Force B)

**Verdict: AGREE**

Reviewed settle semantics, open wait, residual/belt settle-before-Move, and
predicate helpers. Re-ran `pytest tests/unit/cli/ -q` → **307 passed**.

| Check | Result |
| --- | --- |
| FLOAT not settled; TILE + id settled | OK (`window_is_settled`) |
| Open wait does not return on mere class appear when unsettled | OK (`require_settled` default + `_pick_settled_or_note`) |
| Timeout still returns unsettled hit / moves anyway after residual wait | OK (intentional fallback) |
| Residual + belt poll `wait_for_window_ids_settled` before Move | OK |
| `move_step_window_ids` only id: move/park (+ role_pins) | OK |

**Risks remaining:** live re-verify still open; missing-rect TILE counts settled
(documented); no unit test of the wait *loop* itself (predicates covered);
timeout Move may still no-op if never TILE.
