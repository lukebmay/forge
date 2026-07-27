# WR3 — Reconcile executor (dry-run + apply)

**Plan:** [forge-workon-reconcile.md](../../forge-workon-reconcile.md)  
**Status:** Done  
**Priority:** P1 product  
**Depends:** WR1 planner, WR2 path resolve

## Goal

Wire `forge workon <name>` so **v2 reconcile** profiles plan against GetTree and
either print a dry-run or apply opens + moves/layouts. Keep **v1 steps** as
escape hatch (`mode: steps` / version 1 / `--force-launch`).

## Acceptance

1. **Resolve:** run uses `resolve_profile` (host/common/XDG), not XDG-only.
2. **Schema branch:**
   - v1 / `mode: steps` / `--force-launch` → existing steps path (imperative).
   - v2 reconcile (`roles` + layout, or `mode: reconcile`) → planner path.
3. **`--dry-run`** (and/or `forge workon plan <name>`): GetTree → `plan_reconcile` →
   print plan JSON + human counts; **no** launch/RunSteps mutations.
4. **Apply (default for v2):**
   - Optional displays/settings same as FC5 if present on profile.
   - GetTree → plan → for each action:
     - `open` → existing launch helper (app/wmClass/timeout from role open)
     - `move` / `park` → RunSteps `move` with window selector (`id:` preferred)
       dest derived from slot best-effort (monitor path `moNws0` or focus mon)
     - `ensure_layout` → RunSteps `layout` when feasible
   - Re-fetch tree after opens if needed so new windows can be placed.
5. **Report:** human stderr lines (`reused N opened N moved N parked N`) + JSON
   summary with path/source/host/counts/roles.
6. **Already perfect:** apply does nothing harmful (no launches); report nothing to do.
7. Unit tests for pure mapping helpers if extracted; smoke/unit for dry-run path
   without live Shell where possible (mock forest + assert no call side effects).
8. v1 profile regression: existing steps workon still works.

## Implementation guidance

- Prefer small pure helpers for action→steps mapping (testable) in
  `workon_plan.py` or `workon_apply.py`.
- Slot → dest: MVP ok to move to `path:moNws0` (monitor root) for mon N from slot;
  park → overflow mon root. Perfect CON placement can improve later.
- Do not invent new DBus methods.
- `--force-launch` forces v1 steps if profile has steps; if only v2 roles, force
  may mean “ignore claims and open all” — **prefer:** force-launch only valid
  when steps present; else error with clear message. Document.

## Non-goals

- shellrc black/dev.json authoring (WR4)
- Full UX polish list columns (WR5)
- Live black acceptance trials (WR6)
- Killing windows

## Session note

**Done (WR3):** Executor wired. **B verify AGREE** (small fixes applied).

| Piece | Path |
| --- | --- |
| Pure helpers | `scripts/forge/workon_apply.py` — mode detect, slot→`path:moNws0` dest, actions→RunSteps, open→launch |
| CLI | `scripts/forge/forge` `cmd_workon` — `resolve_profile`, reconcile dry-run/apply, v1 steps, flags |
| Tests | `tests/unit/cli/test_workon_apply.py` (+ lib/resolve/plan; 86 CLI unit tests green) |

**B fixes:** (1) layout selector must be `id:` window — mon path fails extension
`matchWindows`; skip ensure_layout when no window on mon so empty apply still
opens. (2) steps path normalizes `version: 1` so `--force-launch` / `mode: steps`
works on dual v2+steps profiles.

**Dry-run:** `forge workon <name> --dry-run` or `forge workon plan <name>`;
`--tree-file` for offline forest. Human stderr counts; JSON stdout `dryRun:true`.

**Apply:** displays/settings → GetTree → plan → ext move/layout/park → launches
→ re-GetTree + residual moves. Perfect → “nothing to do”, no tree/launch mutations.

**Next-agent:** WR4 black `dev` v2 profile in shellrc; WR5 UX polish; WR6 live
trials. Residual: mon-root dest only (no tab-CON); empty desk may skip layout
until residual; no kill; force-launch needs steps[].
