# forge-layout-profile-preflight — Reject / warn on bad layout JSON before apply

**Status:** done
**Plan:** (none)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-22

## Goal

Before ApplyLayout mutates the desk, **parse + validate** the profile and
refuse (or hard-warn) known-bad shapes so operators fix data instead of
debugging “wrong mon / hard-fail” symptoms.

## Acceptance

- [x] Shared validator (JS `lib/shared/layout-plan.js` and/or CLI) runs on
      load/show/apply path before open/bind
- [x] Detect at least:
  - Float / Guake / ignore-class windows baked into `tiles` when the command
    was not `--keep-floats` (save should not have written them)
  - Ambiguous dual-mon intent: flat `tiles: [a, b]` that looks like “two
    apps” when operator likely wanted `[[mon0],[mon1]]` (warn with fix hint;
    optional strict refuse behind flag later)
  - Invalid role objects / unknown keys that normalize would silently drop
- [x] CLI: clear error before DBus ApplyLayout; no partial desk mutation
- [x] L0: fixtures for good `dev`-like dual-mon, flat single-mon (valid), and
      float-contaminated save
- [x] Docs: layouts.md “validation” one-liner + how to fix vinyl-style mistakes

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

**Shipped 2026-08-22 (worktree).** Extended `validateReconcileProfile` /
`validate_reconcile_profile` (no twin validator):

| Check | Behavior |
| --- | --- |
| Float/ignore-class in **tiles** (Guake, ddterm, …) | **Refuse** — move to `floating[]` via `save --keep-floats` |
| Vinyl-style flat `[role, {hsplit\|vsplit}]` | **Warn** (+ `strictAmbiguousDualMon` / `strict_ambiguous_dual_mon` refuse); tab\|role single-mon OK |
| Unknown role-cell / top-level keys | **Refuse** (monN/geom/stable top sugar still allowed) |

**Wire:** CLI show/apply + multi all-or-nothing before ApplyLayout; extension
`parseApplyLayoutRequest` uses validate (no swallow).

**Decision:** dual-mon warn only when flat tiles mix a role cell with an
h/v-split body (vinyl). `app \| {tab:…}` stays quiet.

**Paths:** `lib/shared/layout-plan.js`, `scripts/forge/layout_plan.py`,
`scripts/forge/forge`, `lib/extension/layout-apply-run.js`,
`docs/user/layouts.md`, `docs/user/layout.md`, `docs/dev/contracts.md`,
fixtures `profile-preflight-*.json`,
`tests/unit/shared/layout-plan-preflight.test.js`,
`tests/unit/cli/test_layout_plan.py::TestProfilePreflight`.

**L0:** vitest preflight 7 + normalize 51 + apply-run 39 = **97**; pytest
TestProfilePreflight **6** (+ TestValidateReconcileProfile 13 in earlier run).
No commit/push. Nest unused.
