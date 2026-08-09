# Plan: empty / clean layout profiles

**Status:** active — P0 product bug  
**Priority:** high (broken `forge layout clean`)  
**Branch:** `master`  
**Related:** [docs/user/layout.md](../../docs/user/layout.md) empty desk; WR15 clean; sugar save

---

## Problem

Host profile `clean.json` is:

```json
{
  "tiles": [],
  "description": "No apps open, clean workspace."
}
```

`forge layout clean` / `show clean` fail:

```text
cannot determine layout mode: need version 1 + steps[],
or version 2 + roles[] / tiles / bare array (mode: reconcile)
```

**Root cause (proven):** `detect_layout_mode` treats `tiles: []` as **no tiles**
(`len(tiles) > 0` required). Bare `[]` works; object form with **empty** `tiles`
array (save with description) does not.

`validate_reconcile_profile({"tiles": []})` already accepts empty roles —
only **mode detection** is wrong.

**Product intent (locked):** empty layout = **close residual windows** on apply
(default clean residuals), i.e. wipe the workspace of non-layout windows when
there are zero roles. That is the “clean desk” command.

---

## Fix (small, architectural-clean)

1. **Mode detection:** presence of `tiles` key (list or dict, including empty)
   ⇒ reconcile mode. Same for empty `roles: []` with `version: 2` / `mode: reconcile`.
2. **Unit:** `detect_layout_mode({"tiles": [], "description": "…"})` → reconcile;
   plan with non-empty forest + empty profile → close actions for residual windows.
3. **Live:** `forge layout clean` with open windows → all closed (Guake ignored only
   if windows.json `mode: ignore` or `--keep-floats` profile keeps floats).
4. **Docs:** confirm object `{tiles:[]}` and bare `[]` are equivalent empty desks.

**Do not** special-case the name `clean` — empty roles is the rule.

---

## Tasks

| ID | Task | Status |
| --- | --- | --- |
| CE1 | [detect empty tiles object](../tasks/forge-layout-clean-empty_ce1-detect.md) | ready |

---

## Non-goals

- Changing default residual policy for non-empty profiles
- Closing ignored windows (`mode: ignore` stays)
- Killing processes (Meta delete only)
