# WR10 — Compact `tiles` sugar → v2 IR

**Plan:** [forge-workon-reconcile.md](../plans/forge-workon-reconcile.md)  
**Status:** Ready  
**Priority:** P1 — **next A/B implement** (most useful remaining authoring win)  
**Repo:** this tree (`scripts/forge/`)

## Goal

Humans write a short nested `tiles` sketch. Forge **normalizes** it to the
existing v2 reconcile IR (`roles[]` + `layout` + defaults) before
`plan_reconcile`. No second engine.

## Acceptance

1. Sugar profile like:

   ```json
   {
     "tiles": {
       "mon0": [
         ["google-chrome", "grok"],
         "ghostty"
       ],
       "mon1": [
         "ghostty",
         ["youtube", "gmail", "voice"]
       ]
     }
   }
   ```

   desugars to valid v2 IR: mon h-split (inferred or default), multi-app
   panes **tabbed**, single apps one role each, unique role ids
   (`ghostty`, `ghostty-2`, …).

2. Explicit override forms work: `"split": "h"` / `"v"` / `hsplit` /
   `vsplit` / `horizontal` / `vertical`; nested `{ "split", "content" }`.

3. Nested array form for mon child that is itself a split (e.g. tab group +
   nautilus under v-split) desugars correctly; ambiguous cases prefer
   documented explicit object form.

4. String cells → role with `open` (+ best-effort `match`); rich object
   cells pass through id/match/open.

5. Omit-noise defaults still apply: version/mode, overflow,
   `marginal.mode=coexist`, `roleOrder=first` (even if WR11 implements
   coexist behavior later, normalize should **emit** these defaults).

6. Existing explicit `roles` + `layout` profiles still validate (no
   regression). Sugar and IR may coexist; sugar path is normalize-first.

7. Unit tests pure (no Shell): fixtures for dual-mon happy path, nested
   split, id de-dupe, alias splits, IR pass-through.

8. In-tree example e.g. `scripts/forge/examples/workon-tiles-minimal.json`
   (+ optional richer dual-mon sample).

9. `forge workon show` / dry-run path runs normalize (smoke).

## Non-goals

- Implementing coexist keep/park logic (WR11)  
- Migrating shellrc `dev.json` (WR12)  
- Full desktop-file match resolution beyond best-effort  
- Spatial nearest residual  

## Implementation notes

- Prefer `normalize_profile()` (or equivalent) called once before
  `validate_reconcile_profile` / plan.  
- Keep names short in docs: `tiles`, `split: "h"`, cells as strings.  
- Top-level `floating: []` accepted and reserved (may no-op until later).

## Session note

(empty — fill after implement)
