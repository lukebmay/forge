# Task: MR0–MR2 soft-rehome → monitor-recovery rename

**Status:** done  
**Plan:** [forge-monitor-recovery-rename.md](../../forge-monitor-recovery-rename.md)  
**Branch:** `plan/forge-monitor-recovery-rename`  
**Created:** 2026-08-06  
**Completed:** 2026-08-06  

## Goal

Terminology-only rename: soft-rehome → **monitor-recovery**. Behavior unchanged.

## Scope (plan mapping)

| Old | New |
| --- | --- |
| soft rehome / soft-rehome | **monitor-recovery** |
| `SoftRehomeManager` | `MonitorRecoveryManager` |
| `queueSoftRehomeOnWorkareas` | `queueMonitorRecoveryOnWorkareas` |
| `softRehomeAfterWorkareas` | `recoverAfterWorkareas` |
| `_softRehome*` WM fields | `_monitorRecovery*` / `_recoverAfterWorkareas` |
| test `bug-h1-soft-rehome-*` | `bug-h1-monitor-recovery-*` (H1 id in body) |
| log prefix `soft-rehome:` | `monitor-recovery:` |
| `lib/extension/soft-rehome.js` | `lib/extension/monitor-recovery.js` |

Keep git history note in DESIGN: “formerly soft-rehome (H1).”

## Acceptance

1. No remaining product-facing “soft rehome” (code comments may say “formerly”).
2. Behavior identical; regression thrash tests renamed and green.
3. Separate merge from control-loop settle work (already separate plan branch).
4. `npm test` green; import paths updated (extension, window, tests, mocks).
5. User/dev docs + troubleshooting/monitors updated for product language.
6. Archive/historical plan paths may keep old names in *history* but active product docs use new name.

## Out of scope

- Behavior changes to recovery policy
- Session-backend split
- mon-order / layout planner work

## Session note

**2026-08-06:** Full rename landed. Product code + tests + user/dev DESIGN
docs use monitor-recovery. `npm test` 206 files / 2252 tests green. Historical
`agents/archive` and completed plan tasks left with old names (history).
