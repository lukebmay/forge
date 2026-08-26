# forge-stacked-layouts_sl5-live

**Status:** done  
**Plan:** [forge-stacked-layouts.md](../../forge-stacked-layouts.md)  
**Branch:** `master` (post layout-sizes merge)  
**Updated:** 2026-07-30

## Goal

Live verify STACKED product path on black (Shell 46, dual 4K, X11): mode on,
toggle / absolute layout, save sugar, soft rehome, no Shell thrash. Do **not**
kill Ghostty (agents running).

## What was verified

| Check | Result |
| --- | --- |
| `stacked-tiling-mode-enabled` | **true** (default / live) |
| `layout-cycle` axis=group TABBED→STACKED | **ok** (`changed`, mode STACKED) |
| `layout-cycle` STACKED→TABBED | **ok** |
| Absolute `layout` mode=stacked | **ok** (mon1 3-chrome → CON STACKED) |
| `forge layout save --stdout` | Emits `{ "stack": ["YouTube","Google Voice","Gmail"], "active": "YouTube" }` |
| Soft rehome (`layout apply` of saved stack profile) | **ok** — reused 10 / opened 0 / moved 0; thrashRisk structure only |
| Focus inside STACKED | **ok** (Voice focus) |
| Restore TABBED | **ok** |
| Ghostty PIDs across install HUP + SL5 | **survived** (2 processes) |
| Shell thrash / crash | **none** (`forge ping` ok throughout) |

## Known edge (not blocking SL5)

Layout soft-rehome of a STACKED group **pulled mon1 float** (`Update-manager`)
into the STACKED/TABBED bag (structure ensure). Float toggle alone left it as
FLOAT-or-TILE **child of CON**. Fixed live by `move` to `path:mo1ws0`.

**Follow-up (optional):** structure ensure / merge should skip or peel
already-FLOAT residuals so they stay mon-root floats.

## Session note

Live on black 2026-07-30 after merge of layout-sizes + debug install HUP.
Mon1 cleaned to: ghostty | tab(YT,Gmail,Voice) | float Software Updater.
