# forge-plog-trace-hunts — Dial TRACE call-site noise + layout hunt backlog

**Status:** ready
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

- [ ] Noisy TRACE emitters narrowed or gated; `--dev` tip stays queryable without multi‑MB/minute spam from title churn alone
- [ ] place-hint title=null race understood + fixed or explicitly accepted with test
- [ ] bad-slot YouTube sample reproduced or explained
- [ ] Hunts documented as `forge log --grep/--session/--level` only (project.md already)

## Session note

Queued after shellrc agents-catalog pansi/plog install. Fresh dig used session
`F7UjZ` on Wayland tip `v49-90-beta.2-387-geb3cf7d`.
