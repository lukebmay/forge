# Plan: Dead-simple layout sugar

**Status:** Queued (implement next after wrap of rename / order)  
**Updated:** 2026-07-28  
**Goal:** A layout config so simple you could write it by accident and it still works.

## Product target

### Happy path — bare JSON array (no keys)

**Dual-mon** (top-level length = monitor count): each item is that monitor’s
L→R panes; nested list = **tabbed** group (order = tab order).

```json
[
  [ ["google-chrome", "Grok"], "ghostty" ],
  [ "ghostty", ["YouTube", "Gmail", "Google Voice"] ]
]
```

**Single-mon** (or only one physical mon live): top-level is **panes**, not
monitors — same shape as one mon’s body:

```json
[ ["firefox", "code"], "ghostty" ]
```

Heuristic when loading:

| Live mons | Top-level shape | Interpretation |
| --- | --- | --- |
| 1 | array of cells | panes on mon0 |
| ≥2 | array whose items look like mon bodies (arrays / split objects) | mon0, mon1, … in order |
| ≥2 | flat list of string/app cells only | put all panes on mon0 (best-effort); or pack left→right across mons — **decide in implement task** (prefer: one mon of panes if ambiguous, document it) |

Ambiguous / malformed structure: **load what you can**, ignore the rest;
unclaimed / leftover apps **park safely** (existing soft-park / residual
policy), never crash the planner.

### Object form — only when needed

```json
{
  "description": "optional",
  "tiles": { ... } | [ ... ],
  "floating": [ ... ]
}
```

- Prefer bare array file when there is no floating and no extra metadata.
- `tiles` key only if mixing with `floating` / `description` / advanced IR.
- `mon0` / `mon1` keys remain valid **advanced** sugar (stableKey / alias later);
  not required for the happy path.

### String cells — infer match from `app`

A string is both **open** target and **match** seed:

| Infer | Rule |
| --- | --- |
| `open.app` | the string |
| `title~=` | desktop `Name=` if resolve hits; else the string (or known short frag) |
| `class` | optional: desktop hints / chrome→`Google-chrome` when Exec is chrome; stem match for reverse-DNS (`ghostty`) |
| Chrome PWAs | title disambiguation required; class alone never enough |

Explicit `{ "app", "class", "title~=" }` remains an **override**, not the default
authoring style.

Save (`forge layout save`) should emit the **simplest** form that round-trips:
prefer bare array + string cells; only add objects / `tiles` / titles when
needed for fidelity.

## Why this is the bar

Current black `dev` is already flatter than v2 IR, but still teaches
`tiles` + `monN` + Chrome object cells. Target: **lists and names only**.

## Implementation slices (suggested)

| ID | Work | Notes |
| --- | --- | --- |
| **LS1** | `normalize_profile`: accept bare top-level array → internal tiles IR | mon count from forest at plan time or from array shape |
| **LS2** | String-cell match inference (desktop Name / chrome heuristics) | may need desktop resolve at normalize **or** pure heuristics + optional CLI enrich |
| **LS3** | Best-effort parse + park leftovers | no hard fail on weird JSON shape |
| **LS4** | `layout save` emits bare array when possible | no `floating: []`, no mon keys if index order is enough |
| **LS5** | Docs + black `dev.json` rewrite to bare array | shellrc example is the demo |
| **LS6** | Tests: 1-mon, 2-mon, ambiguous, chrome PWA inference | fixtures |

No backwards compatibility required (pre-release). Old `tiles.monN` and rich
cells keep working as supersets.

## Acceptance (when implemented)

1. File that is **only** the dual-mon array above loads on black and plans correctly.
2. Single-mon array of panes works without wrapping in `[[...]]` mon layer when one mon.
3. `forge layout save dev` (or equivalent) can rewrite to bare array + strings when safe.
4. Missing/inferable class/title not required for Grok/YouTube/Gmail/Voice/ghostty on a typical Chrome+PWA desk.
5. Unit tests green; live black smoke.

## Related shipped

| Item | Note |
| --- | --- |
| `workon` → `layout` | Done |
| Mon L/R `ensure_order` | Done |
| In-group tab order | Done |
| Flat `{app,class,title~=}` cells | Interim sugar (before LS2) |
| Class stem `ghostty` ↔ reverse-DNS | Done |

## Out of scope here

- STACKED product path → [forge-stacked-layouts.md](./forge-stacked-layouts.md)
- Full gdisplays-level monitor identity in bare arrays (mon index order is enough for v1)

## Next task

Implement **LS1 + LS2** first (parse + inference), then black rewrite + save (LS4–LS5).
