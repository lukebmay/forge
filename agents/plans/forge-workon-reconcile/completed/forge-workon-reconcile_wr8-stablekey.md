# WR8 — stableKey monitor names in workon profiles

**Plan:** [forge-workon-reconcile.md](../../forge-workon-reconcile.md)  
**Status:** Done  
**Priority:** Later polish (multi-host)  
**Depends:** WR1–WR7, T7 stableKey on GetTree  

## Goal

Profiles may address monitors by **T7 `stableKey`** (or short aliases), not only
`mon0`/`mon1`, so mon index renumber after GPU/hybrid changes does not break
host profiles.

## Product locks

| Topic | Decision |
| --- | --- |
| Keep `monN` / `primary` | Always valid (default authoring) |
| New: stableKey as tiles/layout key | Exact match to forest mon `stableKey` |
| Optional aliases | Top-level `"monitors": { "left": "geom:…#primary", "right": "geom:…" }` then tiles may use `left` / `right` as mon keys |
| Resolve time | At `plan_reconcile`: map keys → mon **index** using live forest; rewrite IR to `monN` |
| Missing key | Clear error: stableKey not in forest (list available keys) |
| Capture (WR7) | Prefer still emit mon0/mon1 for readability; optional `--stable-key` later **out of scope** |

## Acceptance

1. Profile with tiles keys = full stableKey strings plans correctly on matching forest. ✓
2. Profile with `monitors` alias map + short keys works. ✓
3. mon0/mon1 profiles unchanged (regression tests green). ✓
4. Unit tests with fixture forests that include stableKey on mon nodes. ✓
5. Docs: one short note in `docs/user/workon.md`. ✓

## Non-goals

- Renaming black `dev.json` to stableKeys (keep mon0/mon1)  
- Connector-name only keys without forest stableKey  
- WR9 env snippet  

## Session note

**WR8 Done (A + B rework).** Plan-time rewrite of mon keys → `monN`.

### How resolve works

1. **Validate** accepts mon keys: `monN` / `primary` / T7 `stableKey`
   (`geom:`|`conn:`|`name:…`) / short alias when top-level
   `"monitors": { alias: monN|primary|stableKey }`.
2. **`plan_reconcile`** calls `resolve_profile_mon_keys(prof, forest)` after
   validate: builds `stableKey → index` from forest mon nodes, resolves each
   layout key / role slot head / overflow slot, rewrites IR to `monN.*`, drops
   `monitors` map. Planner + apply keep using `mon_index_from_slot` on monN.
3. Unknown key → `ValueError` listing available forest stableKeys.
4. **Slot head split:** `mon_head_and_rest(slot, known_heads=…)` uses
   **longest-prefix** against layout keys + aliases (validate) or forest
   stableKeys + aliases + layout keys (resolve). Avoids first-`.` split that
   broke dotted stableKeys (`name:Dell.U2720Q.ghostty` → head `name:Dell`).

### Paths

| Path | Change |
| --- | --- |
| `scripts/forge/workon_plan.py` | mon key validate + resolve + rewrite; longest-prefix heads |
| `tests/unit/cli/test_workon_plan.py` | `TestStableKeyMonitors` (+ dotted `name:` case) |
| `docs/user/workon.md` | Monitor keys section |
| `scripts/forge/cli_help.py` | one tiles sugar help line |

### B rework fixes

- Longest-prefix mon head match (validate ↔ resolve agree on dotted keys).
- Unit test: forest mon `stableKey: "name:Dell.U2720Q"`, tiles key / alias → plan.
- Dropped unused `forest_available_stable_keys`.
- PRIORITY session wrap: WR8 Done, next WR9.

### Tests

`pytest tests/unit/cli/ -q` → green.

### Next-agent bullets

- **WR9** shellrc `FORGE_WORKON_DIR` env snippet (still later polish).
- Do not rename black `dev.json` to stableKeys.
- Capture stays mon0/mon1; optional `--stable-key` out of scope unless requested.
- Regression watch if thrash returns outranks WR9.
