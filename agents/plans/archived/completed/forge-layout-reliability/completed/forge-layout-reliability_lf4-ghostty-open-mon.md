# forge-layout-reliability_lf4-ghostty-open-mon

**Status:** done (A/B AGREE)  
**Plan:** [forge-layout-reliability.md](../../forge-layout-reliability.md)  
**Branch:** `plan/forge-layout-reliability`  
**Updated:** 2026-07-29

## Goal

After close **left chrome** + **right Ghostty**, `forge layout dev` leaves **one
Ghostty per mon**, not two on mon0.

## Live

LF3 unit green + install includes LF3; **live re-test still failed** (2 Ghosttys
on left).

## Root causes to fix

1. **Desktop launch forces single-instance:**  
   `/usr/share/applications/com.mitchellh.ghostty.desktop` has  
   `Exec=ghostty --gtk-single-instance=true`.  
   `gio launch` second open reuses process → new window often on mon0 with
   existing instance; PlaceNext easy to miss.
2. Residual move may still not stick Meta mon (need stronger open path + verify).

## Fix direction

1. Launch Ghostty for layout open **without** single-instance desktop default:
   prefer `ghostty --gtk-single-instance=false` or `ghostty +new-window` (argv),
   not plain `gio launch` of the stock desktop when app is ghostty.
2. Keep PlaceNext mon + residual move; optionally second residual pass if mon wrong.
3. Tests: open field / launch mapping for ghostty; plan residual still moves.

## Acceptance

- [x] Ghostty layout open does not use single-instance=true desktop default.
- [x] Plan1: mon0 term reused, mon1 term open when mon1 missing. *(unit LF3 still green)*
- [x] Residual: new Ghostty on wrong mon → move to mon1. *(unit LF3 + belt pass)*
- [x] Unit tests green; notes for live re-verify.

## Non-goals

- Install session focus (SI1).

## Session note (2026-07-29 Task Force A)

**Root cause:** Stock Ghostty desktop `Exec=… --gtk-single-instance=true`.
`launch_app` preferred `gio launch` → second open reuses process; new window
tends to mon0 beside existing instance. LF3 PlaceNext stem + residual move are
insufficient when spawn never creates a true mon-placed process.

**Shipped:**

| Area | Change |
| --- | --- |
| `scripts/forge/layout_apply.py` | `is_ghostty_launch_target`, `ghostty_multi_instance_argv`, rewrite in `open_action_to_launch_fields` |
| `scripts/forge/forge` | `launch_app` spawns argv multi-instance for Ghostty (no gio desktop); desktop only for class hints; belt residual move pass for just_opened wrong-mon |
| `docs/DESIGN.md` | Ghostty launch exception note |
| tests | ghostty open mapping + `launch_app` Popen mock (not gio) |

**Tests:** `pytest tests/unit/cli/ -q` → **298 passed**.

**Live re-verify (operator):** close left chrome + right Ghostty → `forge layout
dev` → one Ghostty per mon. Install/HUP this tree first.

**Branch:** `plan/forge-layout-reliability` — no commit (parent wraps after B).

## Verifier (Task Force B — 2026-07-29)

**VERDICT: AGREE**

### Review checklist

| # | Area | Result |
| --- | --- | --- |
| 1 | `layout_apply.py` rewrite helpers + `open_action_to_launch_fields` | **OK** — bare/`com.mitchellh.ghostty`/path/argv → multi-instance argv; strips `=true`; non-ghostty unchanged |
| 2 | `forge.launch_app` never gio for Ghostty + belt residual | **OK** — early Ghostty branch Popen argv only; desktop used for TryExec/Exec path + hints; belt re-plan moves for `role_pins` when residual still wrong mon |
| 3 | Side effects on non-ghostty apps | **OK** — gated by `is_ghostty_launch_target`; firefox/chrome mapping/tests unchanged; gio/gtk-launch path intact after Ghostty return |
| 4 | `pytest tests/unit/cli/ -q` | **298 passed** (re-run) |

### Findings

None blocking. Notes only (not DISAGREE):

1. **Belt untested as a unit** — belt path is integration-only in `forge`; residual move covered by LF3 `residual_follow_up` tests. Acceptable for this slice; live re-verify still required.
2. **Belt skipped when `still_open`** — intentional; LF3 residual still applies moves while opens lag. If residual fails to stick *and* a peer role is still open, no second pass (pre-existing fail path).
3. **Minor dupe** — `_exec_binary_path` vs `_exec_binary` (basename vs full path); intentional for abs TryExec/Exec.

### Acceptance vs code

- Ghostty layout open does not use stock single-instance desktop Exec: rewrite + `launch_app` argv with `--gtk-single-instance=false`.
- Plan1 mon0 reuse / mon1 open: LF3 unit still present; suite green.
- Residual wrong-mon move: LF3 unit + belt code path.
- Unit green; DESIGN.md documents exception; live re-verify still operator-owned.

### Risks (live)

- Multi-instance may briefly race with existing Ghostty D-Bus/session; PlaceNext + residual/belt are the mon safety net.
- Custom non-stock Ghostty desktop ids not containing stem `ghostty` would still take gio path (out of scope).

**Branch:** `plan/forge-layout-reliability` — no commit/push from B.
