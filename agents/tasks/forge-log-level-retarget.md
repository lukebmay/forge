# forge-log-level-retarget — Retarget GJS/CLI log levels (INFO lifecycle, TRACE hot path)

**Status:** ready
**Plan:** [forge-observability-hardening](../plans/forge-observability-hardening.md) (downstream)
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-08-22

## Goal

Make DEBUG journal usable. Hot-path chatter (render banners, verify
agreement, per-title-changed trees) moves to **TRACE**. Lifecycle and
layout outcomes stay at **INFO**+. Dev install default stays DEBUG only if
DEBUG is no longer a firehose; prefer **INFO** as the eyes-on default and
TRACE when hunting a bug.

## Level rules (product)

| Level | Use for |
| --- | --- |
| **INFO** | Install / session startup (X11 + Wayland); layout load + save; ApplyLayout start/done summary |
| **TRACE** | App launch/map events; window moves/resizes/rehomes; render-tree dumps; verify agreement counters; place-hint chatter |
| **DEBUG** | Targeted instrumentation while debugging a **named** problem (temporary or gated); not routine hot path |
| **WARN** | Soft layout misses; unexpected jitter/thrash that recovered |
| **ERROR** | Hard verifiable failures (forest hard-fail, assert active failures, apply abort) |

Trace must carry **identifying fields** (windowId, class, mon, ws, slot,
applyId) — not banners that only make sense if you already know the code.

## Acceptance

- [ ] Example noise (`render tree from title-changed`, `*****`, `agreement=N → SETTLED`) is TRACE (or gone)
- [ ] Install + extension enable/startup emit INFO once each (X11 HUP and Wayland enable)
- [ ] Layout apply/save emit INFO start + outcome (ok/fail + code)
- [ ] Launch / move / rehome paths are TRACE with ids
- [ ] Soft miss / jitter → WARN; hard-fail / assert → ERROR
- [ ] Dev `./install` log-level default re-evaluated (INFO vs DEBUG) so journal is readable without TRACE
- [ ] Short row in DESIGN or contracts “Logging levels”
- [ ] L0: existing plog-adapter / logger tests updated for any level map change

## Context

GJS sink is Shell `log()` → **journalctl** by design (OH1 adapter). That is
correct for session logs; the problem is level assignment + DEBUG default,
not the sink. Optional later: file sink under `~/.local/state/forge/` for
TRACE campaigns without journal spam.

Host verify 2026-08-22: DEBUG journal flooded with render/verify lines that
did not help diagnose vinyl hard-fail or DnD.

## Session note

Policy ACK’d with operator 2026-08-22. Implement next session.
