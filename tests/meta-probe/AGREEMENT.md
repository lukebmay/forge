# Meta probe — agreement contract

**Status:** design lock (implement against this; do not invent parallel models)  
**Contract version:** `1`  
**Last updated:** 2026-08-07

## Model (no “verification” concept)

On a fixed **check interval**, compare Meta state to the agreement contract:

| Outcome | Meaning | Settle timer |
| --- | --- | --- |
| **agreement** | Hard contract holds; no hard-relevant delta since last check | Continues (accumulates stable duration) |
| **hard disagreement** (`d_*`) | Layout-relevant mismatch or hard signal | **Resets** stable duration to 0 |
| **soft disagreement** (`s_*`) | Noisy / non-layout signal or field | **Recorded only — does not reset** |

**Settled** when continuous **hard-stable** duration ≥ `settleDurationMs` (default **3000**).  
Soft outcomes never interrupt that streak.

There is no separate “verification” layer — only intervalic agreement checks.

## Contract v1 — hard fields

Snapshot must match last hard-stable snapshot on:

| Field | Hard id on mismatch |
| --- | --- |
| frame `x, y, width, height` | `d_frame` (or `d_pos` / `d_size` if only one axis set changes) |
| `monitor` | `d_monitor` |
| `workspace` | `d_workspace` |
| maximized H/V | `d_max` |
| `fullscreen` | `d_fs` |
| `minimized` | `d_min` |
| `wmClass` / instance | `d_class` |

**Hard signals** (any since last check, even if snapshot ends equal):  
`window-created`, `size-changed`, `position-changed`, `workspace-changed`,  
`notify::maximized-*`, `notify::fullscreen`, `notify::minimized`, `unmanaged`,  
and class/wm-class notifies when they change identity.

Multiple hard causes in one check → `d_multi` (catalog lists component ids).

## Contract v1 — soft (observe, do not reset)

| Source | Soft id | Why soft |
| --- | --- | --- |
| `title` / `notify::title` | `s_title` | Terminals/PWAs retitle constantly |
| `notify::appears-focused` / focus-only | `s_focus` | Focus flaps without layout change |
| `raised` alone (no frame/monitor change) | `s_raise` | Restack noise; layout often unchanged |

Soft catalog and timeline entries are **first-class data** — keep them for Forge chrome/focus design — but they **must not** reset `stableFor`.

If a check has **both** hard and soft causes: outcome is **hard** (timer resets); soft ids may be listed as side annotations on that check.

## Timeline record (light)

Per trial:

```json
"checks": [
  { "tMs": 40, "out": "d_size" },
  { "tMs": 140, "out": "agreement" },
  { "tMs": 240, "out": "s_title" },
  { "tMs": 340, "out": "agreement" }
]
```

- `out: "agreement"` — hard contract OK (soft may also be absent)
- `out: "d_*"` — hard disagreement (resets timer)
- `out: "s_*"` — soft only (timer continues)

Run-level once:

```json
"agreementContract": {
  "version": 1,
  "hardFields": ["frame", "monitor", "workspace", "maximized", "fullscreen", "minimized", "wmClass"],
  "softFields": ["title", "appears-focused", "raised-alone"],
  "settleDurationMs": 3000,
  "note": "Soft outcomes never reset settle duration"
},
"disagreementCatalog": {
  "d_size": { "kind": "hard", "shape": "..." },
  "s_title": { "kind": "soft", "shape": "..." }
}
```

Bump **`agreementContract.version`** only if hard/soft membership or settle semantics change. Document the bump in `docs/DECISIONS.md` and this file.

## Settle knobs (related)

| Knob | Role |
| --- | --- |
| `checkIntervalMs` | How often to run a check (cal: dense; full: cal-derived) |
| `settleDurationMs` | Continuous **hard** agreement required (default 3s; same on old hosts) |
| Soft tracking | Always on; no separate “soft duration” gate |

Calibration may tune **interval** (and max wait). It must **not** demote hard fields to soft or shorten duration without an explicit contract version bump.

## Product intent

- **Hard path** → “safe to tile / measure layout settle”  
- **Soft path** → “Meta is chatty but layout-stable” (title bar, focus)  

Forge layout engine should key off **hard** settle. Soft timelines inform decoration/focus policy later.
