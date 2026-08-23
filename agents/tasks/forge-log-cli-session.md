# forge-log-cli-session — Live `forge log` + session override (D052 follow-on)

**Status:** next
**Plan:** (none) — follows D050/D052 logging
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

- [ ] Settings `changed::` for log keys → `reconfigure()` (unit or nest prove raise TRACE without reload)
- [ ] Session override API in `plog-adapter` (+ clear on disable/enable)
- [ ] DBus method(s) for status / set session / reset / optional truncate (or extend SetSetting carefully — prefer dedicated Log* to avoid persisting session)
- [ ] CLI `forge log` as above; help + troubleshooting one-liner
- [ ] `forge log trace` then file shows TRACE; `forge log reset` returns to durable DEBUG; `--persist` survives new enable (session cleared, durable kept)
- [ ] Docs: troubleshooting + contracts logging row; DECISIONS if new id needed (else D052 addendum)
- [ ] L0: plog-adapter + CLI parse/help tests green

## Context for the next agent

- **Shipped already:** D050 dual-sink · D052 `--dev`→DEBUG + enable truncate · open-min late-adopt `98538d9` / logging `531db43`
- **Paths:** `lib/shared/plog-adapter.js` · `extension.js` enable/disable · `lib/extension/session-api.js` (GetSetting/SetSetting exist; `forge get log-level` works) · `cli/` new `log.mjs` + router · `docs/user/troubleshooting.md`
- **Prove:** nest or host after tip — no logout required for level change once this ships
- **Out of scope:** bulk TRACE→DEBUG call-site retarget; rotating archives; delete-on-disable

## Session note

Queued as **next** agent P0 after D052 discussion. Soft human host verify
unrelated and does not block this slice.
