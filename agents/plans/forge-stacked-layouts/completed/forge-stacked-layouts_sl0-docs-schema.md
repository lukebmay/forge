# Task: SL0 — STACKED docs + schema hygiene

**Status:** done  
**Plan:** [forge-stacked-layouts.md](../plans/forge-stacked-layouts.md)  
**Depends:** Spike A/B AGREE (done)

## Work

1. `config/settings.schema.json`: `stacked-tiling-mode-enabled` default **`false`** (match gschema)
2. Fix docs that claim both modes on by default:
   - `docs/user/layouts.md`
   - `docs/user/troubleshooting.md` (as needed)
3. Short **stacked vs tabbed** guidance in `layouts.md` (when to use; opt-in flag; tab-first DnD when off)
4. Do **not** flip gschema product default; do **not** implement SL1 save round-trip
5. Tests only if schema is tested; otherwise docs/schema only

## Acceptance

1. [x] settings.schema.json matches gschema default false
2. [x] User docs no longer claim stack-on by default
3. [x] layouts.md has clear stacked vs tabbed section
4. [x] No executable/test surface changed — suite not required
5. [x] Plan/task/PRIORITY notes; next = SL1

## Session note

**2026-07-28 SL0 (Task Force A)**

- `config/settings.schema.json` `stacked-tiling-mode-enabled` default → `false` (matches gschema).
- `docs/user/layouts.md`: stacked vs tabbed section; opt-in + DnD/keybind behavior; bare array stays tabbed.
- `docs/user/troubleshooting.md`: stack opt-in, not “both on by default”.
- No gschema flip, no SL1. Next: **SL1** profile save round-trip.
