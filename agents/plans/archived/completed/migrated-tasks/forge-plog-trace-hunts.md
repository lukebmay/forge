# forge-plog-trace-hunts — Dial TRACE call-site noise + layout hunt backlog

**Status:** done
**Plan:** (none) — follow-up from 2026-08-23 fresh Wayland `F7UjZ` dig after
`forge update --dev`
**Branch:** master
**Blocker:** (none) — soft host eyes-on optional after code
**Updated:** 2026-08-23

## Goal

Keep **TRACE + dual-tape query** as the hunt model (D068). Make TRACE
**usable**: cut emitter noise, then dig the layout signals found on host
session `F7UjZ` (pid 618140, ~17:08 Wayland tip).

## Context (proven on host 2026-08-23)

Session **`F7UjZ`**: ~9.6k records / ~3.5 min @ TRACE (~48 lines/sec).

| Bucket | Share / note |
| --- | --- |
| `float-reason` | ~63% — dumped for every tiled window on title-changed |
| `title-changed` | ~4.4/sec — Ghostty spinner titles (`⠋ Responding…`) |
| `verify mismatch` | **5** only — then SETTLED |
| WARN/ERROR | **none** |

Layout applies **dev** then **vinyl** succeeded at INFO. Interesting signals:

1. **place-hint `title=null` race** — `late mismatch re-queue` for ghostty
   (`forge-ph-3`) and inkscape (`forge-ph-8`); recovered via confirm; YouTube
   **late adopt** onto another ph while mismatch in flight.
2. **verify mismatch samples** — YouTube `244879615`: `bad-slot`+`mon-mismatch`
   during vinyl; Inkscape `244879617`: `rect-mismatch`(+mon); Nautilus
   `244879618`: `rect-mismatch`.
3. **Title-changed → full render tax** — spinner titles force tree render +
   float-reason fanout + session-layout save loop.

Tapes: `~/.local/state/forge/forge.log` + `.jsonl`. Always query:

```sh
forge log --session F7UjZ --level info+ --grep 'place-hint|verify mismatch'
forge log --grep float-reason --last 5   # proof of noise, not a hunt
```

## Priority order (do in this order)

| Pri | Item | Intent |
| --- | --- | --- |
| **P0** | **TRACE call-site dial-back** | Stop per-window `float-reason` (and similar) on every `title-changed` unless hunting that path; gate noisy TRACE behind hunt tags / rarer events; keep query-first docs (project.md done) |
| **P1** | **title-changed render tax** | Spinner / high-churn titles should not full-tree render + session-layout save every tick — debounce, ignore title-only, or skip float-reason fanout |
| **P1** | **place-hint `title=null` race** | Why ghostty/inkscape map before title on Wayland; confirm vs adopt ordering; ensure dest still correct without thrash |
| **P2** | **`bad-slot` + `mon-mismatch`** on YouTube during vinyl apply (`id=244879615`) | Deepest layout bug candidate in that tape — reproduce under nest with traces |
| **P2** | Inkscape / Nautilus brief `rect-mismatch` | Likely settle jitter; confirm not sticky |

Do **not** reverse D068 (`--dev`→TRACE) without a new design lock — prefer
narrowing emitters. `forge log debug` remains the operator escape hatch.

## Acceptance

- [x] Noisy TRACE emitters narrowed or gated; `--dev` tip stays queryable without multi‑MB/minute spam from title churn alone
- [x] place-hint title=null race understood + fixed or explicitly accepted with test
- [x] bad-slot YouTube sample reproduced or explained
- [x] Hunts documented as `forge log --grep/--session/--level` only (project.md already)

## Session note

**All acceptance closed (uncommitted with prior P0/P1 + OH Downstream).** D068 kept.

### Place-hint `title=null` / late mismatch (accepted + test)

**Proven (JSONL raw `text`, not pretty reprint):** F7UjZ mismatches were **FIFO
wrong-window**, not ghostty/inkscape self-mismatch.

| Raw line | Meaning |
| --- | --- |
| `late mismatch re-queue class=ghostty … win=chrome-…YouTube title=null` | YouTube null-map claimed ghostty ph-3; class landed → class-only ready → mismatch re-queue |
| Same pattern for inkscape ph-8 | Same YouTube steal |
| Dest recovery | Ghostty/inkscape later re-claim → confirm; YouTube late-adopts own ph |

`placeHintIdentityReady` already waits when the **hint** wants title (Gmail/Voice
`late wait` with class + `title=null`). Class-only hints correctly decide on class
alone — including mismatch while title still null. Brief wrong-slot then rehome is
intentional R036; final dest correct.

**Pretty-log footgun:** `forge log` reprint collapsed duplicate `class=` keys so
mismatch looked like `class=ghostty title=null` (self). Prefer JSONL `text`, or
new labels below.

| Change | Where |
| --- | --- |
| Late/match logs use `winClass=` / `winTitle=` | `window.js` `_tryPlanFromPlaceHint` / `_tryAdoptLatePlaceHint` |
| Regression: class-only wrong FIFO + matching confirm w/ null title | `WindowManager-open-app-policy` + `place-hint.test.js` |

### P2 bad-slot YouTube / rect-mismatch (explained)

YouTube `244879615`: `bad-slot`+`mon-mismatch` on same tick as
`late apply tree mon 0→1`, **before** `late idle move mon→1`. Tree/home already
mon1; Meta still mon0; slot mid-reparent → verify noise. Next second:
`verify ok → SETTLED`. Not sticky.

Inkscape/Nautilus `rect-mismatch` samples also brief settle jitter around map /
vinyl (same tape pattern). No code change.

### Prior (unchanged)

| Change | Where |
| --- | --- |
| Keep `float-reason` TRACE gated off | `HUNT_FLOAT_REASON_KEEP=false` |
| Spinner / non-empty title churn skips `renderTree` | `notify::title`; empty↔nonempty + late-adopt still render |
| R029 | `tests/regression/bug-r029-late-title.test.js` |

**Verify:** place-hint + open-app-policy L0 green (81). `./install --dev` → nest
`forge ping` ok (apiVersion 11); **nest stopped**.
