# forge-log-level-retarget — Dual-sink logging + level retarget (P0)

**Status:** blocked
**Plan:** [forge-observability-hardening](../plans/forge-observability-hardening.md)
**Branch:** master
**Blocker:** [plog-hooks-shellrc](../blockers/plog-hooks-shellrc.md) (soft here;
  hard design lives in shellrc
  `~/dev/me/shellrc/agents/blockers/B-plog-hooks-design.md`)
**Updated:** 2026-08-22

## Goal

**High priority** — stop guessing from noisy journals. Quiet journal for
eyes-on; full independent forge log for TRACE/DEBUG hunts. Retarget call
sites so INFO/WARN/ERROR mean lifecycle and failures, TRACE carries
identifying hot-path detail.

## Architecture (locked with operator 2026-08-22)

| Sink | Levels | Role |
| --- | --- | --- |
| **Journal** (Shell `log()`) | **INFO / WARN / ERROR only** | Quiet; relatively sparse |
| **Independent forge log** | TRACE…ERROR (min level gated) | Full hunt log; same records as journal for INFO+ |
| **plog hooks** | Fan-out by level after filter | `plog.info()` → file **and** journal; `plog.trace()` → file only |

Depends on shellrc plog **sink hooks** (v1 design non-goal’d journald).
Until hooks land + vendored into `third_party/pansi/`, do **not** invent a
forge-only parallel logger.

Proposed file default (implement without re-asking unless conflict):
`~/.local/state/forge/forge.log` (or `$FORGE_LOG_FILE` override; nest under
nested state). Rotate/clear policy = follow plog design after hooks.

## Level rules (call sites)

| Level | Use for |
| --- | --- |
| **INFO** | Install; session startup (X11 + Wayland); layout load/save; ApplyLayout start + outcome |
| **TRACE** | App launch/map; window moves/resizes/rehomes; render-tree / verify agreement (with ids) |
| **DEBUG** | Temporary / named-problem instrumentation only — not routine hot path |
| **WARN** | Soft layout misses; unexpected jitter that recovered |
| **ERROR** | Hard verifiable failures (forest hard-fail, assert, apply abort) |

TRACE lines must include identifying fields (windowId, class, mon, ws,
slot, applyId) — not banners that only help if you already know the code.

## Acceptance

- [ ] shellrc hooks designed + implemented + vendored into forge
- [ ] Journal shows only INFO+; no title-changed / `*****` / agreement spam
- [ ] Independent log receives TRACE+ (and INFO+) for the same session
- [ ] Install + startup INFO; layout load/save INFO; launch/move TRACE
- [ ] Soft miss → WARN; hard-fail / assert → ERROR
- [ ] Dev install default min level = **INFO** for journal eyes-on (TRACE
      via file / env when hunting)
- [ ] DESIGN/contracts “Logging sinks + levels” row
- [ ] L0: plog-adapter / CLI plog tests for dual sink + level gate

## Parallel work (agents — do not wait idle)

While this task is **blocked**, continue other PRIORITY items:
layout preflight · slot-id hard-fail · oversized-frame min learn · DnD
preview. **Do not** stop to ask the operator about logging details already
locked above unless a **critical new finding** appears.

## Context

Host verify 2026-08-22: DEBUG→journal firehose. Operator: journal =
info/warn/error only; independent log for trace/debug (+ info/warn/error);
plog hooks for fan-out. Circle back here after shellrc hooks ship.

## Session note

Blocked on shellrc design meeting. P0 — not optional/later.
