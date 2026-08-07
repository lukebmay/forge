# Meta probe — agreement contract

**Status:** implemented  
**Contract version:** `1`  
**Last updated:** 2026-08-07

## Model (agreement only — no “verification”)

On every **check interval**, classify Meta state:

| Outcome | Meaning | Settle timer |
| --- | --- | --- |
| **agreement** | No hard signals; snapshot soft-ok | Continues (accumulates hard-stable duration) |
| **hard** `d_*` | Hard-relevant **signal** since last check | **Resets** duration to 0 |
| **soft** `s_*` | Soft signal **or** snapshot thrash | **Recorded only — does not reset** |

**Settled** when continuous hard-stable duration ≥ `settleDurationMs`.

Uses **both** event drain and snapshot compare. In v1, **snapshot-only layout diffs are soft** (may promote later via contract version bump). Hard resets come from **hard signals**.

## Hard signals (reset timer)

`window-created`, `size-changed`, `position-changed`, `workspace-changed`,  
`notify::maximized-*`, `notify::fullscreen`, `notify::minimized`,  
`notify::wm-class`, `unmanaged`

Unknown signals are **hard** (minted as `d_auto_<hash>` in the run catalog).

## Soft (observe only)

| Id | Source |
| --- | --- |
| `s_title` | `notify::title` |
| `s_focus` | `notify::appears-focused` |
| `s_raise` | `raised` alone |
| `s_snap_*` | snapshot field thrash without hard event (`frame`, `monitor`, …) |

## Auto-named disagreements

If a shape is outside the known set, mint `d_auto_*` / `s_auto_*`, store in  
`disagreementCatalog` for the run (reuse if the same shape appears again).

## Timeline (light)

```json
"checks": [
  { "tMs": 40, "out": "d_size" },
  { "tMs": 90, "out": "agreement" },
  { "tMs": 140, "out": "s_title" }
]
```

## Knobs

| Knob | Bootstrap (first cal) | Later cal | Full samples |
| --- | --- | --- | --- |
| `checkIntervalMs` | **50** | **50** | derived (50–500) |
| `settleDurationMs` | **10000** | session derived | session derived (≥3000) |

Slow hosts: derivation **raises** `settleDurationMs` (more jitter spacing), never lowers quality by shortening.

## Matrix

Per **app+op** (ops never interleaved): **1× calibration** then **N× full** (default N=10).  
All trials held **in memory**; **one** JSON write after the matrix.  
Close all test windows after each app and at end.  
**Return to WS1 only when the measurement session is finished.**

## Versioning

Bump `agreementContract.version` only if hard/soft membership or settle semantics change.  
Document in `docs/DECISIONS.md`.
