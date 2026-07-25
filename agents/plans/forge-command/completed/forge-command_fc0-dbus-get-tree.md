# Task — FC0: DBus Ping + GetTree + CLI stub

**Status:** Done (A/B **AGREE**)  
**Plan:** [forge-command.md](../plans/forge-command.md)  
**Priority:** P1  
**Kind:** Plan-linked  
**When done:** move to `agents/plans/forge-command/completed/`

## Problem

No user-facing control plane. Scripts and `workon` cannot inspect the tiling
tree without `Shell.Eval` (e2e-only). Need a stable DBus surface and a minimal
`forge` CLI before selectors/move/launch.

## Goals

1. Extension exports DBus interface (prefer
   `org.gnome.Shell.Extensions.Forge` on session bus) with:
   - **`Ping()`** → health JSON (`ok`, uuid, version-name if available)
   - **`GetTree(options_json)`** → JSON tree snapshot (e2e-bridge-like
     projection: nodeType, layout, rect, wmClass, title, children; include
     monitor id / stableKey when present; no live Meta.Window refs)
2. Pure projection helper unit-testable without Mutter when possible
   (e.g. `lib/extension/tree-query.js`).
3. `lib/extension/session-api.js` owns export; wired in
   `extension.js` enable/disable (disconnect/unexport on disable; keep
   available on unlock-dialog if tree stays loaded).
4. User-facing CLI stub **`forge`** (under `scripts/forge/` or similar) with:
   - `forge ping`
   - `forge tree` (`--json` default or pretty; optional `--monitor=`)
5. Unit tests for projection; `npm test` green.
6. Short DESIGN + plan note; no Shell.Eval in production path.

## Code touch list (expected)

| Area | Notes |
| --- | --- |
| New `lib/extension/tree-query.js` | Pure mapTree / project for CLI JSON |
| New `lib/extension/session-api.js` | DBus export, Ping, GetTree |
| `extension.js` | create/enable/disable SessionApi |
| CLI under `scripts/forge/` | `forge` multi-command stub |
| Tests | tree-query unit tests |
| `docs/DESIGN.md` | why DBus + projection shape |
| Plan/task/priority | status updates |

## Acceptance

- [x] DBus `Ping` returns ok JSON when extension enabled
- [x] DBus `GetTree` returns serializable forest/tree without Meta refs
- [x] Projection unit-tested (mock nodes)
- [x] `forge ping` / `forge tree` call DBus (graceful error if extension off)
- [x] enable/disable cleans bus name / export (no leak)
- [x] `npm test` green
- [x] No RunSteps / launch / selectors (FC1+)
- [x] No workon DSL (FC5)

## Out of scope

- Tile selectors, focus/move/swap (FC1)
- `forge launch` (FC2)
- Settings get/set (FC3)
- RunSteps / freezeRender batch (FC4)
- `workon` (FC5)

## Session note

**Task Force B (verify) — 2026-07-25 — AGREE**

Reviewed diff vs acceptance: DBus name/path/iface match CLI; Ping/GetTree
`(s)` signatures; enable after `extWm`, disable unexport+unown before
`extWm` null; unlock-dialog leaves sessionApi up; projection strips Meta
(unit + JSON round-trip); errors JSON not throw; CLI exit 1 when bus down,
127 missing deps, `--help`/`--version` ok. `npm test` 1751 green. No FC1+
scope. B one-liner: `_onBusAcquired` no-ops if `!_enabled` (disable race).

### Residual risks (OK to ship)
1. Live DBus not in Vitest — host smoke: `forge ping` / `forge tree` after enable.
2. `wrapJSObject` / `bus_own_name` not exercised under Shell in CI.
3. gdbus unquote fallback best-effort; prefer python3-gi.
4. GetTree = MONITOR forest only (not ROOT/WORKSPACE scaffold) — intentional.

### Next-agent bullets
- Orchestrator: mark FC0 Done, move task to plan `completed/`, plan status.
- Live smoke on host when Shell available.
- Do not start FC1 until wrap complete.

---

**Task Force A (implement) — 2026-07-25** (condensed)

Files: `tree-query.js`, `session-api.js`, `extension.js`, `scripts/forge/forge`,
tests, DESIGN, README. Bus `org.gnome.Shell.Extensions.Forge` path
`/org/gnome/Shell/Extensions/Forge`; methods `Ping()→s`, `GetTree(s)→s`.
