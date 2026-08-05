# Plan: Rename soft-rehome → monitor-recovery

**Status:** ready (terminology-only; separate PR)  
**Priority:** P2 hygiene (do **after** or **between** control-loop slices; never mixed into settle logic commits)  
**Branch:** `plan/forge-monitor-recovery-rename`  
**Created:** 2026-08-05  
**Depends on:** none functionally; schedule away from large control-loop PRs to keep review clean

### Session note (overwrite)

**2026-08-05:** Plan filed. Soft-rehome is Luke H1 (not jcrussell). Rename is
docs+symbols only; behavior unchanged.

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
- Extracted: audit CA5 → `lib/extension/soft-rehome.js`.

## Mapping (canonical)

| Old | New |
| --- | --- |
| soft rehome / soft-rehome | **monitor-recovery** |
| `SoftRehomeManager` | `MonitorRecoveryManager` |
| `queueSoftRehomeOnWorkareas` | `queueMonitorRecoveryOnWorkareas` (or shorter `queueOnWorkareas` on the manager) |
| `softRehomeAfterWorkareas` | `recoverAfterWorkareas` |
| `_softRehome*` WM fields | `_monitorRecovery*` |
| test `bug-h1-soft-rehome-*` | `bug-h1-monitor-recovery-*` (keep H1 id in body if useful) |
| log prefix `soft-rehome:` | `monitor-recovery:` |

Keep git history note in DESIGN one-liner: “formerly soft-rehome (H1).”

## Tasks

| ID | Work | Status |
| --- | --- | --- |
| **MR0** | Inventory all soft-rehome references (`rg`); rename plan checklist | next |
| **MR1** | Code + tests rename; `npm test` green | pending |
| **MR2** | User/dev docs + archive cross-links | pending |

## Acceptance

1. No remaining product-facing “soft rehome” (code comments may say “formerly”).
2. Behavior identical; regression thrash tests renamed and green.
3. Separate merge from [forge-layout-control-loop](./forge-layout-control-loop.md).

## Handoff

Single focused PR; do not land with CL* settle work.
