# forge-log-level-retarget — Dual-sink logging + level retarget (P0)

**Status:** done
**Plan:** [forge-observability-hardening](../plans/forge-observability-hardening.md)
**Branch:** master
**Blocker:** [plog-hooks-shellrc](../blockers/plog-hooks-shellrc.md) → **closed**
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

Default file: `~/.local/state/forge/forge.log` (`$FORGE_LOG_FILE`; nest =
sibling of `FORGE_CONFIG_HOME`). Decision: **D050**.

## Level rules (call sites)

| Level | Use for |
| --- | --- |
| **INFO** | Install; session startup (X11 + Wayland); layout load/save; ApplyLayout start + outcome |
| **TRACE** | App launch/map; window moves/resizes/rehomes; render-tree / verify agreement (with ids) |
| **DEBUG** | Temporary / named-problem instrumentation only — not routine hot path |
| **WARN** | Soft layout misses; unexpected jitter that recovered |
| **ERROR** | Hard verifiable failures (forest hard-fail, assert, apply abort) |

## Acceptance

- [x] shellrc hooks designed + implemented + vendored into forge (PLOG 1.2.0 / GJS Gio)
- [x] Journal shows only INFO+; no title-changed / `*****` / agreement spam
- [x] Independent log receives TRACE+ (and INFO+) for the same session
- [x] Soft miss → WARN; hard-fail / assert → ERROR
- [x] DESIGN/contracts “Logging sinks + levels” row + D050
- [x] L0: plog-adapter / CLI plog tests for dual sink + level gate

## Session note

2026-08-22 — **done.** Vendored shellrc `b15b6f0` (PLOG 1.2.0). Adapter dual-sink
via plog actions; custom levels table mirrors prefs; CLI shares file default;
Makefile packs `third_party/`; render/agreement/`*****` → TRACE.
