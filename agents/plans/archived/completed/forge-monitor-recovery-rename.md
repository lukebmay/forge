# Plan: Rename soft-rehome → monitor-recovery

**Status:** done (terminology-only; branch ready to merge)  
**Priority:** P2 hygiene (do **after** or **between** control-loop slices; never mixed into settle logic commits)  
**Branch:** `plan/forge-monitor-recovery-rename`  
**Created:** 2026-08-05  
**Depends on:** none functionally; schedule away from large control-loop PRs to keep review clean

### Session note (overwrite)

**2026-08-06:** MR0–MR2 shipped on `plan/forge-monitor-recovery-rename`.
Module `lib/extension/monitor-recovery.js` (`MonitorRecoveryManager`), WM
`monitorRecovery` + `_queueMonitorRecoveryOnWorkareas` / `_recoverAfterWorkareas`,
H1 test `bug-h1-monitor-recovery-workareas-thrash.test.js`. Docs + DESIGN
“formerly soft-rehome (H1)”. `npm test` 206/2252 green. Behavior unchanged.
Historical agents/archive paths keep old names by design.

---

## Why

“Soft rehome” implies a “hard rehome” pair we never productized. The subsystem
only does **monitor workareas thrash recovery** (last-good homes + T6 forest).
Product language: **monitor-recovery**.

## Scope

| In | Out |
| --- | --- |
| Rename module, class, methods, fields, log strings, tests, user docs | Behavior changes |
| `soft-rehome.js` → `monitor-recovery.js` (or `monitor-recovery/`) | Control-loop / open settle work |
| Update DESIGN, monitors.md, troubleshooting, comments | Session-backend split |

## Origin (do not re-research)

- Introduced this fork: `a897516` *feat(tiling): soft-rehome windows after workareas thrash (H1)* (Luke, 2026-07-23).
- Not present as a named path in jcrussell / `forge_original`.
- Extracted: audit CA5 → `lib/extension/soft-rehome.js` (now `monitor-recovery.js`).

## Mapping (canonical)

| Old | New |
| --- | --- |
| soft rehome / soft-rehome | **monitor-recovery** |
| `SoftRehomeManager` | `MonitorRecoveryManager` |
| `queueSoftRehomeOnWorkareas` | `queueMonitorRecoveryOnWorkareas` |
| `softRehomeAfterWorkareas` | `recoverAfterWorkareas` |
| `_softRehome*` WM fields / methods | `_monitorRecovery*` / `_recoverAfterWorkareas` |
| test `bug-h1-soft-rehome-*` | `bug-h1-monitor-recovery-*` (H1 id kept in describe body) |
| log prefix `soft-rehome:` | `monitor-recovery:` |

Keep git history note in DESIGN one-liner: “formerly soft-rehome (H1).”

## Tasks

| ID | Work | Status |
| --- | --- | --- |
| **MR0** | Inventory all soft-rehome references (`rg`); rename plan checklist | **done** |
| **MR1** | Code + tests rename; `npm test` green | **done** |
| **MR2** | User/dev docs + archive cross-links | **done** (active product docs; historical agents/* left as history) |

## Acceptance

1. No remaining product-facing “soft rehome” (code comments may say “formerly”).
2. Behavior identical; regression thrash tests renamed and green.
3. Separate merge from [forge-layout-control-loop](./forge-layout-control-loop.md).

## Handoff

Single focused PR; do not land with CL* settle work. Merge when review-ready.
