# forge-log-cli-session — Live `forge log` + session override (D052 follow-on)

**Status:** done
**Plan:** (none) — follows D050/D052 logging · **D053**
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-22
**Agent:** **4.5**

## Goal

Change extension log level **without tip reload / logout**. Session-only bump
for hunts; optional durable gsettings write. Fix live raise so plog
`reconfigure()` actually applies TRACE.

## Locked UX (operator 2026-08-22)

```text
forge log                 # status: durable / session / effective
forge log trace           # session-only (until disable/enable or reset)
forge log debug | info | warn | error | off
forge log reset           # clear session → durable
forge log trace --persist # write gsettings (multi-session)
forge log --truncate      # empty forge.log now (same as enable)
```

**Do not** add top-level `forge --log-level` / `--init-log-level` (CLI-only
confusion; hunts are in Shell).

| Mode | Behavior |
| --- | --- |
| Session (default) | In-memory override in extension; cleared on disable/enable; no gsettings write |
| `--persist` | `logging-enabled` + `log-level` via existing SetSetting / gsettings |
| Effective | Session wins when set; else durable. Status prints all three |
| CLI `FORGE_LOG_LEVEL` | CLI process only — never drives Shell |

## Prerequisite (ship in same slice)

Wire `changed::log-level` + `changed::logging-enabled` → plog `reconfigure()`
(no truncate). Today `shouldEmit` reads gsettings live, but plog min is stale
until reconfigure — raising TRACE via `forge set log-level 6` may no-op.

## Acceptance

- [x] Settings `changed::` for log keys → `reconfigure()` (unit + nest apiVersion 11)
- [x] Session override API in `plog-adapter` (+ clear on disable/enable)
- [x] DBus `Log` (status / set / reset / truncate); apiVersion **11**
- [x] CLI `forge log` as above; help + troubleshooting one-liner
- [x] Nest: `forge log trace` → session TRACE; `reset` → durable DEBUG; `--persist` / `--truncate` ok
- [x] Docs: troubleshooting + contracts + DESIGN + **D053**
- [x] L0: plog-adapter + CLI parse/help tests green (40)

## Context for the next agent

- **Shipped:** D053 `forge log` · paths `lib/shared/plog-adapter.js` · `cli/log.mjs` · `session-api.js` `Log` · `extension.js` `shutdownLogging`
- **Next P0:** OH downstream — monitor identity + same-mon dock launch ([plan](../plans/forge-observability-hardening.md) § Downstream)
- Soft human host verify still open (does not block)

## Session note

Implement + nest prove (install → nested restart → apiVersion 11; session/reset/persist/truncate). Host tip still needs logout for eyes-on of new DBus. Uncommitted on master until operator asks commit.
